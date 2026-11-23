/* Sistema de Reconhecimento Facial — Projeto acadêmico FMP
 * Tudo roda no navegador (face-api.js). Nenhuma imagem é enviada para servidor.
 * Cadastros e a maior correspondência ficam no localStorage deste navegador.
 */
const MODELOS = [
  'models',                                                   // pasta do próprio projeto
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model',
  'https://raw.githubusercontent.com/vladmandic/face-api/master/model',
];
const LIMITE_DISTANCIA = 0.55;   // distância < limite = correspondência provável
const CAPTURAS_CADASTRO = 8;     // quantas amostras do rosto no cadastro
const K_CADASTROS = 'rf-fmp:cadastros:v1';
const K_MELHOR = 'rf-fmp:melhor:v1';

const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('overlay');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cadastros = [];       // [{id, nome, autorizadoEm, foto, descritores:[[128]]}]
let matcher = null;       // faceapi.FaceMatcher
let ultimo = [];          // rostos da última análise
let pausado = false, ocupado = false, fotoAtual = null, historico = [];

// ------------------------------------------------ distância -> %
// 0 = idêntico. Escala igual à do projeto base: d=0,30 ≈ 89%, d=0,55 ≈ 72%, d=0,80 ≈ 51%.
function pct(d) {
  if (d == null || isNaN(d)) return 0;
  const t = Math.min(1, Math.max(0, (0.88 - d) / 0.88));
  return Math.round(100 * t ** 0.28);
}
const LIMIAR_PCT = pct(LIMITE_DISTANCIA);

// ------------------------------------------------ armazenamento
function lerCadastros() {
  try { return JSON.parse(localStorage.getItem(K_CADASTROS)) || []; } catch { return []; }
}
function salvarCadastros() {
  try { localStorage.setItem(K_CADASTROS, JSON.stringify(cadastros)); return true; }
  catch { alert('O navegador não tem mais espaço para cadastros. Apague algum cadastro.'); return false; }
}
function montarMatcher() {
  matcher = cadastros.length
    ? new faceapi.FaceMatcher(cadastros.map(c =>
        new faceapi.LabeledFaceDescriptors(c.id, c.descritores.map(d => new Float32Array(d)))),
      LIMITE_DISTANCIA)
    : null;
}

// ------------------------------------------------ modelos e câmera
async function carregarModelos() {
  let ultimoErro;
  for (const url of MODELOS) {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      return;
    } catch (e) { ultimoErro = e; console.warn('Falha ao carregar modelos de', url, e); }
  }
  throw ultimoErro;
}

async function iniciarCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador não permite câmera aqui. Abra pelo endereço https:// do GitHub Pages.');
  }
  const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = s;
  await new Promise(r => video.readyState >= 1 ? r() : (video.onloadedmetadata = r));
  await video.play();
}

const opcoes = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 });

async function analisar(fonte) {
  const dets = await faceapi.detectAllFaces(fonte, opcoes()).withFaceLandmarks().withFaceDescriptors();
  return dets.map(d => {
    const b = d.detection.box;
    let nome = null, id = null, distancia = null;
    if (matcher) {
      const m = matcher.findBestMatch(d.descriptor);
      distancia = m.distance;
      if (m.label !== 'unknown') { id = m.label; nome = cadastros.find(c => c.id === id)?.nome ?? null; }
    }
    return { x: b.x, y: b.y, w: b.width, h: b.height, nome, id, porcentagem: pct(distancia), descritor: d.descriptor };
  });
}

// ------------------------------------------------ desenho
function desenhar(ctx, rostos, escala = 1) {
  ctx.lineWidth = 3 * escala;
  ctx.font = `bold ${Math.round(18 * escala)}px system-ui, sans-serif`;
  const alt = Math.round(26 * escala);
  for (const r of rostos) {
    const ok = !!r.nome;
    const cor = ok ? '#22c55e' : '#ef4444';
    const txt = ok ? `${r.nome} (${r.porcentagem}%)` : `Não cadastrado (${r.porcentagem}%)`;
    ctx.strokeStyle = cor; ctx.strokeRect(r.x, r.y, r.w, r.h);
    const tw = ctx.measureText(txt).width + 12 * escala, ty = Math.max(0, r.y - alt - 2);
    ctx.fillStyle = cor; ctx.fillRect(r.x, ty, tw, alt);
    ctx.fillStyle = '#fff'; ctx.fillText(txt, r.x + 6 * escala, ty + alt - 7 * escala);
  }
}

function atualizarTela(rostos) {
  overlay.width = video.videoWidth; overlay.height = video.videoHeight;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  desenhar(ctx, rostos, overlay.width / 640);

  const res = $('resultado');
  if (!rostos.length) {
    res.textContent = 'Nenhum rosto detectado'; res.className = '';
    historico = []; barra(0, false); $('btnCadastrar').classList.add('oculto');
    return;
  }
  const p = rostos.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));  // rosto principal = maior
  res.textContent = p.nome ? `Correspondência provável: ${p.nome} (${p.porcentagem}%)` : 'Rosto não cadastrado';
  res.className = p.nome ? 'ok' : 'nao';
  barra(p.porcentagem, !!p.nome);
  $('btnCadastrar').classList.toggle('oculto', !!p.nome);
}

// Barra suavizada (média das últimas leituras) com cor por faixa
function barra(valor, reconhecido) {
  historico.push(valor); if (historico.length > 4) historico.shift();
  const media = Math.round(historico.reduce((a, b) => a + b, 0) / historico.length);
  $('pct').style.width = media + '%';
  $('pct').style.background = reconhecido ? 'var(--verde)' : (media >= LIMIAR_PCT - 8 ? 'var(--amarelo)' : 'var(--vermelho)');
  $('pctTexto').textContent = media + '%';
  $('pctTexto').style.color = reconhecido ? 'var(--verde)' : 'var(--texto)';
}

async function loop() {
  if (!pausado && !ocupado && video.readyState >= 2) {
    ocupado = true;
    try { ultimo = await analisar(video); atualizarTela(ultimo); }
    catch (e) { console.warn(e); }
    ocupado = false;
  }
  setTimeout(loop, 250);
}

// ------------------------------------------------ foto com resultado
function fotoComResultado(rostos) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth; c.height = video.videoHeight;
  const ctx = c.getContext('2d'), esc2 = c.width / 640;
  ctx.drawImage(video, 0, 0);
  desenhar(ctx, rostos, esc2);
  const h = Math.round(30 * esc2);
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, c.height - h, c.width, h);
  ctx.fillStyle = '#fff'; ctx.font = `${Math.round(14 * esc2)}px system-ui, sans-serif`;
  ctx.fillText(`Correspondência provável (não confirma identidade) — ${new Date().toLocaleString('pt-BR')}`,
    8 * esc2, c.height - 10 * esc2);
  return c;
}

function reduzir(canvas, largura = 800, q = 0.85) {
  const k = Math.min(1, largura / canvas.width);
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

function baixar(dataUrl, nome) {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = `${nome}-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`; a.click();
}

$('btnFoto').onclick = async () => {
  pausado = true;
  while (ocupado) await new Promise(r => setTimeout(r, 30));
  const rostos = await analisar(video);
  const canvas = fotoComResultado(rostos);
  fotoAtual = canvas.toDataURL('image/jpeg', 0.92);
  $('foto').src = fotoAtual;
  $('telaVideo').classList.add('oculto'); $('telaFoto').classList.remove('oculto');
  $('acoesVideo').classList.add('oculto'); $('acoesFoto').classList.remove('oculto');

  const top = rostos.filter(r => r.nome).sort((a, b) => b.porcentagem - a.porcentagem)[0];
  const melhor = lerMelhor();
  if (top && (!melhor || top.porcentagem > melhor.porcentagem)) {
    salvarMelhor({ nome: top.nome, id: top.id, porcentagem: top.porcentagem,
      data: new Date().toLocaleString('pt-BR'), imagem: reduzir(canvas) });
    $('msgFoto').textContent = '🏆 Nova maior correspondência registrada!';
  } else {
    $('msgFoto').textContent = rostos.length ? 'Foto gerada. Use "Baixar foto" para salvar.' : 'Nenhum rosto na foto.';
  }
};
$('btnBaixar').onclick = () => baixar(fotoAtual, 'reconhecimento');
$('btnNova').onclick = () => {
  pausado = false; $('msgFoto').textContent = '';
  $('telaFoto').classList.add('oculto'); $('telaVideo').classList.remove('oculto');
  $('acoesFoto').classList.add('oculto'); $('acoesVideo').classList.remove('oculto');
};

// ------------------------------------------------ maior correspondência (fixa)
function lerMelhor() { try { return JSON.parse(localStorage.getItem(K_MELHOR)); } catch { return null; } }
function salvarMelhor(m) {
  try { m ? localStorage.setItem(K_MELHOR, JSON.stringify(m)) : localStorage.removeItem(K_MELHOR); } catch {}
  mostrarMelhor(m);
}
function mostrarMelhor(m = lerMelhor()) {
  $('melhorConteudo').innerHTML = m ? `
    <img src="${m.imagem}" alt="Maior correspondência">
    <div class="nome">Correspondência provável: ${esc(m.nome)}</div>
    <div class="medidor"><div class="trilho"><div class="preenchimento" style="width:${m.porcentagem}%;background:var(--verde)"></div></div>
    <strong style="color:var(--verde)">${m.porcentagem}%</strong></div>
    <small>Registrado em ${esc(m.data)}</small>
    <div class="acoes">
      <button class="primario" id="btnBaixarMelhor">⬇ Baixar</button>
      <button class="secundario" id="btnLimparMelhor">Limpar</button>
    </div>`
    : '<small>Tire uma foto com um rosto reconhecido para registrar aqui.</small>';
  if (m) {
    $('btnBaixarMelhor').onclick = () => baixar(m.imagem, 'maior-correspondencia');
    $('btnLimparMelhor').onclick = () => confirm('Limpar a maior correspondência?') && salvarMelhor(null);
  }
}

// ------------------------------------------------ cadastros
function mostrarLista() {
  $('lista').innerHTML = cadastros.length ? cadastros.map(c => `
    <li><img src="${c.foto}" alt="">
      <div class="info"><strong>${esc(c.nome)}</strong><br>
      <small>${c.descritores.length} amostras · autorizado em ${esc(c.autorizadoEm)}</small></div>
      <button class="perigo" data-id="${c.id}">Apagar</button></li>`).join('')
    : '<small>Nenhum rosto cadastrado ainda.</small>';
  $('lista').querySelectorAll('button[data-id]').forEach(b => b.onclick = () => apagar(b.dataset.id));
}

function apagar(id) {
  const c = cadastros.find(x => x.id === id);
  if (!c || !confirm(`Apagar o cadastro "${c.nome}" e suas imagens?`)) return;
  cadastros = cadastros.filter(x => x.id !== id);
  salvarCadastros(); montarMatcher(); mostrarLista();
  if (lerMelhor()?.id === id) salvarMelhor(null);
}

function recorteRosto(r) {
  const m = 0.35, c = document.createElement('canvas');
  const sx = Math.max(0, r.x - r.w * m), sy = Math.max(0, r.y - r.h * m);
  const sw = Math.min(video.videoWidth - sx, r.w * (1 + 2 * m)), sh = Math.min(video.videoHeight - sy, r.h * (1 + 2 * m));
  c.width = 120; c.height = Math.round(120 * sh / sw);
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

const validar = () => { $('btnCapturar').disabled = !($('nome').value.trim() && $('aut').checked); };
$('nome').oninput = validar; $('aut').onchange = validar;
$('btnCadastrar').onclick = () => { $('formCadastro').classList.remove('oculto'); $('nome').focus(); };
$('btnCancelar').onclick = () => { $('formCadastro').classList.add('oculto'); $('msgCad').textContent = ''; };

$('btnCapturar').onclick = async () => {
  const nome = $('nome').value.trim();
  if (!nome || !$('aut').checked) return;
  $('btnCapturar').disabled = true; pausado = true;
  while (ocupado) await new Promise(r => setTimeout(r, 30));
  $('progCad').classList.remove('oculto');

  const descritores = []; let foto = null;
  for (let i = 0; i < CAPTURAS_CADASTRO * 2 && descritores.length < CAPTURAS_CADASTRO; i++) {
    $('msgCad').textContent = `Capturando ${descritores.length + 1}/${CAPTURAS_CADASTRO}... mova levemente o rosto`;
    const rostos = await analisar(video);
    if (rostos.length) {
      const r = rostos.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      descritores.push(Array.from(r.descritor));
      if (!foto) foto = recorteRosto(r);
    }
    $('progBarra').style.width = (descritores.length / CAPTURAS_CADASTRO * 100) + '%';
    await new Promise(r => setTimeout(r, 200));
  }
  $('progCad').classList.add('oculto'); $('progBarra').style.width = 0;

  if (descritores.length < 3) {
    $('msgCad').textContent = 'Poucos rostos detectados. Fique de frente para a câmera com boa iluminação e tente de novo.';
  } else {
    cadastros.push({ id: crypto.randomUUID(), nome, foto, descritores,
      autorizadoEm: new Date().toLocaleString('pt-BR') });
    if (salvarCadastros()) {
      montarMatcher(); mostrarLista();
      $('msgCad').textContent = `"${nome}" cadastrado com ${descritores.length} amostras.`;
      $('nome').value = ''; $('aut').checked = false;
      setTimeout(() => { $('formCadastro').classList.add('oculto'); $('msgCad').textContent = ''; }, 2500);
    } else {
      cadastros.pop();
    }
  }
  pausado = false; historico = []; validar();
};

// ------------------------------------------------ exportar / importar base
$('btnExportar').onclick = () => {
  const blob = new Blob([JSON.stringify({ versao: 1, cadastros }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'base-facial.json'; a.click();
  URL.revokeObjectURL(a.href);
};
$('arqBase').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const dados = JSON.parse(await f.text());
    const novos = (dados.cadastros || []).filter(c => c.id && c.nome && Array.isArray(c.descritores)
      && !cadastros.some(x => x.id === c.id));
    cadastros.push(...novos);
    if (salvarCadastros()) { montarMatcher(); mostrarLista(); alert(`${novos.length} cadastro(s) importado(s).`); }
  } catch { alert('Arquivo inválido. Use um base-facial.json exportado por este sistema.'); }
};

// ------------------------------------------------ início
(async function iniciar() {
  $('marcaLimiar').style.left = LIMIAR_PCT + '%';
  $('textoLimiar').textContent = `limite ${LIMIAR_PCT}%`;
  cadastros = lerCadastros(); mostrarLista(); mostrarMelhor();
  try {
    if (typeof faceapi === 'undefined') throw new Error('Não foi possível carregar lib/face-api.js. Confira se a pasta lib/ foi enviada.');
    await carregarModelos();
    montarMatcher();
    $('carregandoTexto').textContent = 'Abrindo câmera...';
    await iniciarCamera();
    $('carregando').classList.add('oculto');
    loop();
  } catch (e) {
    console.error(e);
    const msg = e.name === 'NotAllowedError' ? 'Permissão da câmera negada. Clique no cadeado da barra de endereço e permita a câmera.'
      : e.name === 'NotFoundError' ? 'Nenhuma câmera encontrada neste computador.'
      : e.name === 'NotReadableError' ? 'A câmera está sendo usada por outro programa (Teams, Meet, OBS...). Feche-o e recarregue.'
      : (e.message || String(e));
    $('carregandoTexto').innerHTML = `⚠️ ${esc(msg)}<br><br><button class="primario" onclick="location.reload()">Tentar novamente</button>`;
    $('carregando').querySelector('.giro').classList.add('oculto');
  }
})();
