/**
 * GATILHO INSTANTÂNEO — dispara o robô do GitHub assim que um formulário é enviado.
 *
 * Sem isso, o dashboard atualiza sozinho a cada 10 minutos (agendamento do robô).
 * Com isso, atualiza em ~1 minuto depois de cada envio.
 *
 * ---------------------------------------------------------------
 * PASSO 1 — criar o token do GitHub (uma vez):
 *   1. Abra: https://github.com/settings/tokens?type=beta
 *   2. "Generate new token"
 *      - Token name: robo-cedro
 *      - Expiration: No expiration (ou 1 ano)
 *      - Repository access: "Only select repositories" > Dashboard-cedro
 *      - Permissions > Repository permissions > Contents: Read and write
 *   3. "Generate token" e COPIE o token (começa com github_pat_...)
 *
 * PASSO 2 — instalar este gatilho:
 *   1. Em script.google.com, abra o MESMO projeto onde você criou os formulários
 *   2. Cole este arquivo abaixo do que já está lá (ou em um novo arquivo .gs)
 *   3. Troque COLE_SEU_TOKEN_AQUI pelo token copiado
 *   4. Selecione a função "instalarGatilhos" no seletor do topo e clique em Executar
 *   5. Autorize quando pedir. Pronto!
 *
 * Para testar: rode a função "dispararRobo" e veja em
 * https://github.com/cedu360/Dashboard-cedro/actions se o robô rodou.
 * ---------------------------------------------------------------
 */

var GITHUB_TOKEN = "COLE_SEU_TOKEN_AQUI";
var REPO = "cedu360/Dashboard-cedro";

// IDs dos formulários criados (Inspeção e Tratativa)
var FORM_IDS = [
  "11m3kG7IXWcSauPeZC3jyTeumGc2Ynm6802PdyBuHGew",
  "1D0LMkkJRSDEUzKi0e4S3GHYmo0KkzOWp6hg37fzdGPk",
];

/** Chamado automaticamente a cada envio de formulário. */
function aoEnviarFormulario(e) {
  dispararRobo();
}

/** Pede ao GitHub para rodar o robô agora. */
function dispararRobo() {
  var url = "https://api.github.com/repos/" + REPO + "/actions/workflows/atualizar.yml/dispatches";
  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    payload: JSON.stringify({ ref: "main" }),
    muteHttpExceptions: true,
  });
  var code = resp.getResponseCode();
  Logger.log(code === 204
    ? "OK - robo disparado, dashboard atualiza em ~1 minuto"
    : "ERRO " + code + ": " + resp.getContentText());
}

/** Instala o gatilho nos dois formulários (rode esta função uma vez). */
function instalarGatilhos() {
  // remove gatilhos antigos para não duplicar
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "aoEnviarFormulario") ScriptApp.deleteTrigger(t);
  });
  FORM_IDS.forEach(function (id) {
    var form = FormApp.openById(id);
    ScriptApp.newTrigger("aoEnviarFormulario").forForm(form).onFormSubmit().create();
    Logger.log("gatilho instalado em: " + form.getTitle());
  });
  Logger.log("Pronto! Agora cada envio atualiza o dashboard automaticamente.");
}
