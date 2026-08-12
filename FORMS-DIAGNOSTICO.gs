/**
 * DIAGNÓSTICO — mostra TODOS os formulários da conta, com quantas respostas
 * cada um tem e qual planilha está ligada.
 *
 * Serve para descobrir se alguém preencheu um formulário duplicado/antigo.
 *
 * COMO USAR:
 * 1. script.google.com > projeto dos formulários
 * 2. Novo arquivo de script > cole ISTO
 * 3. Função "diagnosticar" > Executar
 * 4. Copie o "Registro de execução" e me mande.
 */

function diagnosticar() {
  var it = DriveApp.getFilesByType("application/vnd.google-apps.form");
  var achou = 0;
  Logger.log("=================== FORMULÁRIOS ===================");
  while (it.hasNext()) {
    var arq = it.next();
    achou++;
    var f, n = "?", url = "?", dest = "sem planilha";
    try {
      f = FormApp.openById(arq.getId());
      n = f.getResponses().length;
      url = f.getPublishedUrl();
      try {
        var did = f.getDestinationId();
        if (did) dest = "https://docs.google.com/spreadsheets/d/" + did;
      } catch (e) {}
    } catch (e) {
      Logger.log("  (não consegui abrir: " + e + ")");
    }
    Logger.log("");
    Logger.log('NOME: "' + arq.getName() + '"');
    Logger.log("  RESPOSTAS: " + n);
    Logger.log("  LINK DE PREENCHER: " + url);
    Logger.log("  PLANILHA: " + dest);
    Logger.log("  Criado em: " + arq.getDateCreated());
    Logger.log("  Lixeira? " + arq.isTrashed());

    // mostra o resumo da última resposta, se houver
    try {
      if (f && n > 0) {
        var ult = f.getResponses()[n - 1];
        Logger.log("  ÚLTIMA RESPOSTA: " + ult.getTimestamp());
        var itens = ult.getItemResponses();
        for (var i = 0; i < Math.min(itens.length, 5); i++) {
          Logger.log("     " + itens[i].getItem().getTitle() + " = " + String(itens[i].getResponse()).slice(0, 50));
        }
      }
    } catch (e) {}
  }
  Logger.log("");
  Logger.log("===================================================");
  Logger.log("Total de formulários encontrados: " + achou);
  Logger.log("Compare: o que o dashboard usa é o que termina em ...ScIJIN_55XxEK...");
}
