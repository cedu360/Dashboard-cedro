# Controle de Inspeções — Áreas da Mina

Controle de frequência de visitas dos técnicos de segurança e das não conformidades (NC), usando o grupo do WhatsApp como fonte. Sem sistema, sem cadastro: o técnico manda mensagem no grupo, você exporta a conversa e roda o script.

## Áreas monitoradas

Britagem · Britagem 2 · Britagem 3 · Concentração · Filtro Prensa · Área de Vivência

Regra de cores (janela de 15 dias, ajustável em `JANELA_DIAS` no `nc-mina.js`):

- 🟢 **Verde** — inspecionada nos últimos 15 dias e sem NC aberta
- 🟡 **Amarelo** — inspecionada, mas com NC aberta (dentro do prazo)
- 🔴 **Vermelho** — sem inspeção na janela **ou** com NC vencida

## Mensagens que os técnicos mandam no grupo (fixe no grupo!)

**Encontrou não conformidade:**

```
#NC
Área: Britagem 2
Equipamento: Correia TC-01
Problema: Cabo elétrico exposto
Risco: Alto
Responsável: Manutenção
Prazo: 20/07
```

Só `Área` e `Problema` são obrigatórios — o resto é opcional. Também funciona escrito solto, tipo: `#NC britagem 2 - guarda corpo solto perto da peneira`.

**Dando andamento / resolvendo uma NC já lançada** (Status `Concluído` encerra a NC automaticamente):

```
#ACOMPANHAMENTO
Área: Britagem 2
NC: Cabo elétrico exposto
Status: Concluído
Observação: Cabo isolado e fixado.
```

**Inspecionou e estava tudo certo (importante! senão a área fica vermelha):**

```
#INSPECAO Filtro Prensa - tudo ok
```

**Rodada geral em várias áreas** (uma mensagem `#INSPEÇÃO GERAL` com várias linhas `Área:` registra visita em todas).

## Mapa da mina

Se existir um `planta.png` na pasta do projeto, o dashboard mostra o mapa real com cada área pintada na cor do status. As posições dos polígonos ficam no bloco `MAPA` no topo do `nc-mina.js` (coordenadas em % da imagem).

## Rotina quinzenal (ou mensal)

1. No WhatsApp: abrir o grupo → ⋮ → **Mais** → **Exportar conversa** → **Sem mídia**
2. Salvar/copiar o arquivo `.txt` para a pasta `exports\` deste projeto
3. Dar dois cliques no **`rodar.bat`**
4. Pronto: abre o `dashboard.html` (para PDF: Ctrl+P → Salvar como PDF)

Pode exportar a conversa inteira toda vez — o script não duplica registros já lançados.

## Planilhas geradas (pasta `data\`)

- **`nao_conformidades.csv`** — todas as NCs. Abre no Excel. **Para encerrar uma NC, mude a coluna `Status` para `Encerrada`** (e anote na `Observacao` se quiser) e rode o script de novo. Suas edições são preservadas.
- **`inspecoes.csv`** — todas as visitas registradas (data, hora, técnico, área).

## Teste

Tem um exemplo de conversa em `exemplo\exemplo_conversa.txt`. Copie para `exports\`, rode o `rodar.bat` e veja o dashboard. Depois apague a pasta `data\` e o arquivo de exemplo de `exports\` para começar do zero com os dados reais.
