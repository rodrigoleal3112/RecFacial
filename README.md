# Sistema de Reconhecimento Facial

Projeto acadêmico — Faculdade Municipal de Palhoça (FMP).

**Acesse:** `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

## Objetivo
Sistema web que reconhece rostos pela câmera e mostra:
- **"Correspondência provável: Nome (89%)"**, com uma **barra de porcentagem de 0 a 100%** e a marca do limite;
- **"Rosto não cadastrado"** com o botão **Cadastrar rosto** quando a semelhança fica abaixo do limite.

Outras funções:
- moldura em cada rosto da câmera, com o nome fictício e a %;
- **Tirar foto com resultado**: imagem com moldura, nome, % e data/hora, para baixar;
- **Maior correspondência registrada**: fica fixa ao lado da câmera, com a foto, o nome fictício e a %, para conferência;
- lista de rostos cadastrados com **Apagar**, e **Exportar/Importar base** para levar os cadastros a outro computador.

O cadastro pede **apenas um nome fictício** e a **autorização do participante** (caixa de aceite obrigatória).

> O sistema não confirma identidade: ele calcula a semelhança entre descritores faciais. Cadastros faciais são dados biométricos, mesmo com nomes fictícios.

## Tecnologias
- HTML, CSS e JavaScript puro (sem servidor e sem build)
- [face-api.js](https://github.com/vladmandic/face-api) 1.7.15 (TensorFlow.js): detecção Tiny Face Detector, 68 pontos faciais e descritor de 128 dimensões
- GitHub Pages (hospedagem)

Tudo roda **no navegador**: nenhuma imagem é enviada para servidor. Biblioteca e modelos estão no próprio projeto (`lib/` e `models/`).

## Como a porcentagem é calculada
A distância euclidiana entre o rosto da câmera e os cadastros é convertida para 0–100% (`pct()` em `app.js`). Distância menor que `LIMITE_DISTANCIA` (0,55) = correspondência provável; na barra, esse limite aparece como a marca "limite 76%".

## Publicar no GitHub Pages
1. Envie **todos** os arquivos desta pasta para a raiz do repositório (inclusive `lib/`, `models/` e `.nojekyll`).
2. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
3. Espere 1–2 minutos e abra o endereço que aparece em Settings → Pages.
4. Permita a câmera quando o navegador pedir.

## Rodar no computador
Abra um terminal nesta pasta e rode um servidor simples:
```bash
python -m http.server 8000
```
Depois abra http://localhost:8000. (A câmera só funciona em `https://` ou `localhost`.)

## Uso
1. Fique de frente para a câmera. A moldura e a barra mostram o nome provável e a %.
2. Em "Rosto não cadastrado", clique em **Cadastrar rosto**, digite um nome fictício, marque a autorização e clique em **Capturar e cadastrar** (mova levemente a cabeça).
3. **Tirar foto com resultado** gera a imagem com a %. A maior % fica fixa em **Maior correspondência registrada**.
4. **Apagar** remove o cadastro e suas imagens.

## Ajustes
- `LIMITE_DISTANCIA` em `app.js`: diminua (ex.: 0,50) se aparecer reconhecimento errado; aumente (ex.: 0,60) se a própria pessoa não for reconhecida.

## Privacidade (LGPD)
- Cadastros, fotos e a maior correspondência ficam **só no navegador** de quem usou (localStorage). Não vão para o GitHub.
- Só cadastre quem marcou a autorização. Qualquer cadastro pode ser apagado pela tela.

## Problemas comuns
| Mensagem | Solução |
|---|---|
| Permissão da câmera negada | Clique no cadeado da barra de endereço → Câmera → Permitir → recarregue |
| Câmera sendo usada por outro programa | Feche Teams, Meet, OBS etc. e recarregue |
| Página em branco / modelos não carregam | Confira se as pastas `lib/` e `models/` foram enviadas ao GitHub |

## Estrutura
```
index.html   interface
app.js       câmera, reconhecimento, barra de %, cadastro, foto com resultado
estilo.css   visual
lib/         face-api.js
models/      modelos de reconhecimento
.nojekyll    necessário para o GitHub Pages
```
