/**
 * CRIA OS 2 FORMULÁRIOS DA CEDRO MINERAÇÃO NO GOOGLE FORMS — AUTOMÁTICO
 *
 * Como usar (5 minutos):
 * 1. Entre em  script.google.com  (logado na sua conta Google)
 * 2. "Novo projeto" > apague o que estiver no editor > cole ESTE arquivo inteiro
 * 3. Clique em "Executar" (botão ▶). Na 1ª vez ele pede autorização:
 *    "Revisar permissões" > sua conta > "Avançado" > "Acessar projeto..." > Permitir
 * 4. Abra o "Registro de execução" (embaixo): estarão os 4 LINKS.
 *    Copie os 4 e me mande — eu coloco no dashboard e na automação.
 */

var RESPONSAVEIS = [
  "Anderson Magalhães", "Daniele Coutinho", "Tiago Santos", "Juscelino Santos",
  "Lucas Conrado", "Alberto Inácio", "Josiane Lima", "Fabiana Mello",
  "Flavia Tanner", "Wagner Rocha", "Phelippe Cerqueira",
];

var LOCAIS = [
  "Britagem 1", "Britagem 1A", "Concentração (Planta 3 + GX600)", "Filtragem",
  "PEC", "Planta 4", "Área de Lavra",
  "Banheiro/Vestiário Cedro ADM", "Banheiro/Vestiário Cedro Operacional",
  "Banheiro/Vestiário Cedro Contratadas",
  "Pátio Balança", "Balança", "Oficina AJPM", "Oficina MPC",
  "Restaurante", "Centro Administrativo", "Portaria", "Outros",
];

var RISCOS = ["Baixo", "Médio", "Alto", "Crítico"];
var STATUS = ["Aberto", "Em andamento", "Concluído"];

function criarFormularios() {
  // ================= FORMULÁRIO 1 — INSPEÇÃO =================
  var f = FormApp.create("Inspeção de Segurança — CEDRO MINERAÇÃO");
  f.setDescription("Registro de inspeções e não conformidades do setor de Segurança do Trabalho.\nGerente: Alberto · Coordenadora: Josiane Lima");
  f.setAllowResponseEdits(false);

  f.addDateItem().setTitle("Data da inspeção").setRequired(true);
  f.addTextItem().setTitle("Hora aproximada da inspeção").setHelpText("Exemplo: 08:30");
  f.addCheckboxItem().setTitle("Responsável(is) pela inspeção").setChoiceValues(RESPONSAVEIS).setRequired(true);
  f.addListItem().setTitle("Local / Ponto inspecionado").setChoiceValues(LOCAIS).setRequired(true);
  f.addTextItem().setTitle('Se marcou "Outros", especifique o local');
  f.addMultipleChoiceItem().setTitle("Tipo de inspeção")
    .setChoiceValues(["Rotina", "Programada", "Não Programada", "Auditoria"]).setRequired(true);

  // P7 com ramificação: "Não" encerra o formulário (registra só a visita)
  var p7 = f.addMultipleChoiceItem().setTitle("Houve não conformidade / desvio?")
    .setHelpText('Responder "Não" também vale: comprova a visita e mantém a área verde no controle de frequência.')
    .setRequired(true);

  var pagNC1 = f.addPageBreakItem().setTitle("Não conformidade");
  p7.setChoices([
    p7.createChoice("Sim", pagNC1),
    p7.createChoice("Não", FormApp.PageNavigationType.SUBMIT),
  ]);

  f.addMultipleChoiceItem().setTitle("Tipo de ocorrência")
    .setChoiceValues(["Condição Insegura", "Ato Inseguro"]);
  f.addMultipleChoiceItem().setTitle("Classificação de risco").setChoiceValues(RISCOS).setRequired(true);
  f.addMultipleChoiceItem().setTitle("Potencial de gravidade")
    .setChoiceValues(["Sem lesão", "Leve", "Grave", "Fatal"]);
  f.addParagraphTextItem().setTitle("Descrição da não conformidade / desvio")
    .setHelpText("Descreva de forma objetiva: local exato, equipamento (use a TAG se souber, ex.: TC-01, BP-04), atividade em execução e possíveis causas.")
    .setRequired(true);
  f.addParagraphTextItem().setTitle("Ação imediata adotada").setHelpText("Se não se aplica, deixe em branco.");
  f.addParagraphTextItem().setTitle("Ação corretiva / plano de ação");
  f.addTextItem().setTitle("Responsável pela tratativa")
    .setHelpText("Equipe ou pessoa que vai corrigir (ex.: Manutenção mecânica, Elétrica, Civil, Facilities...)")
    .setRequired(true);
  f.addMultipleChoiceItem().setTitle("Empresa responsável")
    .setChoiceValues(["Cedro", "AJPM", "MPC", "Outra contratada"]);
  f.addDateItem().setTitle("Prazo para adequação").setRequired(true);
  f.addMultipleChoiceItem().setTitle("Status da tratativa").setChoiceValues(STATUS).setRequired(true);
  f.addDateItem().setTitle("Data de conclusão").setHelpText("Preencha apenas se o status for Concluído.");
  f.addTextItem().setTitle("Responsável pela verificação / validação");

  // P21 com ramificação: mais uma NC nesta mesma inspeção?
  var p21 = f.addMultipleChoiceItem()
    .setTitle("Registrar OUTRA não conformidade nesta mesma inspeção?").setRequired(true);
  var pagNC2 = f.addPageBreakItem().setTitle("NC 2");
  p21.setChoices([
    p21.createChoice("Sim", pagNC2),
    p21.createChoice("Não", FormApp.PageNavigationType.SUBMIT),
  ]);

  f.addParagraphTextItem().setTitle("NC 2 — Descrição da não conformidade").setRequired(true);
  f.addMultipleChoiceItem().setTitle("NC 2 — Classificação de risco").setChoiceValues(RISCOS);
  f.addTextItem().setTitle("NC 2 — Responsável pela tratativa");
  f.addDateItem().setTitle("NC 2 — Prazo para adequação");
  f.addMultipleChoiceItem().setTitle("NC 2 — Status da tratativa").setChoiceValues(STATUS);

  var p27 = f.addMultipleChoiceItem()
    .setTitle("Registrar mais uma (terceira) NC?").setRequired(true);
  var pagNC3 = f.addPageBreakItem().setTitle("NC 3");
  p27.setChoices([
    p27.createChoice("Sim", pagNC3),
    p27.createChoice("Não", FormApp.PageNavigationType.SUBMIT),
  ]);

  f.addParagraphTextItem().setTitle("NC 3 — Descrição da não conformidade").setRequired(true);
  f.addMultipleChoiceItem().setTitle("NC 3 — Classificação de risco").setChoiceValues(RISCOS);
  f.addTextItem().setTitle("NC 3 — Responsável pela tratativa");
  f.addDateItem().setTitle("NC 3 — Prazo para adequação");
  f.addMultipleChoiceItem().setTitle("NC 3 — Status da tratativa").setChoiceValues(STATUS);

  // planilha de respostas + compartilhamento por link (para a automação baixar)
  var ss1 = SpreadsheetApp.create("Respostas — Inspeção de Segurança CEDRO");
  f.setDestination(FormApp.DestinationType.SPREADSHEET, ss1.getId());
  DriveApp.getFileById(ss1.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // ================= FORMULÁRIO 2 — TRATATIVA =================
  var t = FormApp.create("Tratativa de NC — CEDRO MINERAÇÃO");
  t.setDescription("Mudança de status de uma não conformidade pelo número (ex.: NC-0042). O número aparece no dashboard.");

  t.addTextItem().setTitle("Número da NC").setHelpText("O número que aparece no dashboard (ex.: NC-0042)").setRequired(true);
  t.addMultipleChoiceItem().setTitle("Novo status").setChoiceValues(["Em andamento", "Concluído"]).setRequired(true);
  t.addParagraphTextItem().setTitle("Observação / evidência").setHelpText("O que foi feito, quem executou, etc.");
  t.addListItem().setTitle("Responsável pela atualização").setChoiceValues(RESPONSAVEIS).setRequired(true);
  t.addDateItem().setTitle("Data da atualização").setRequired(true);

  var ss2 = SpreadsheetApp.create("Respostas — Tratativa de NC CEDRO");
  t.setDestination(FormApp.DestinationType.SPREADSHEET, ss2.getId());
  DriveApp.getFileById(ss2.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // ================= LINKS =================
  Logger.log("================ COPIE ESTES 4 LINKS ================");
  Logger.log("1) INSPECAO - link para preencher: " + f.getPublishedUrl());
  Logger.log("2) INSPECAO - planilha xlsx (automacao): https://docs.google.com/spreadsheets/d/" + ss1.getId() + "/export?format=xlsx");
  Logger.log("3) TRATATIVA - link para preencher: " + t.getPublishedUrl());
  Logger.log("4) TRATATIVA - planilha xlsx (automacao): https://docs.google.com/spreadsheets/d/" + ss2.getId() + "/export?format=xlsx");
  Logger.log("=====================================================");
  Logger.log("Editar os formularios: " + f.getEditUrl() + "  |  " + t.getEditUrl());
}
