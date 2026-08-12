/**
 * CORRIGE O FORMULÁRIO DE INSPEÇÃO QUE JÁ ESTÁ NO AR — sem trocar o link.
 *
 * O que faz:
 *   - Deixa "NC 2 — Descrição" e "NC 3 — Descrição" OPCIONAIS.
 *     (Hoje são obrigatórias: quem marca "Sim" em "Registrar OUTRA
 *      não conformidade" e não preenche fica travado, sem conseguir enviar.)
 *   - Confere e mostra no log tudo o que encontrou.
 *
 * COMO USAR:
 * 1. script.google.com > abra o projeto dos formulários
 * 2. Crie um arquivo novo (+ > Script) e cole ISTO
 * 3. Escolha a função "corrigirFormulario" no topo > Executar > autorize
 * 4. Veja o "Registro de execução" e recarregue o formulário (F5).
 *    O LINK NÃO MUDA — não precisa reenviar nada para os técnicos.
 *
 * Se aparecer "formulário não encontrado", rode a função "listarFormularios"
 * e me mande o log que eu ajusto o nome.
 */

var NOME_FORM = "Inspeção de Segurança — CEDRO MINERAÇÃO";

function corrigirFormulario() {
  var form = acharFormPorNome(NOME_FORM);
  if (!form) {
    Logger.log('ERRO: não encontrei o formulário "' + NOME_FORM + '".');
    listarFormularios();
    return;
  }
  Logger.log("Formulário: " + form.getTitle());
  Logger.log("Editar: " + form.getEditUrl());
  Logger.log("--------------------------------------------------");

  var alvos = [
    "NC 2 — Descrição da não conformidade",
    "NC 3 — Descrição da não conformidade",
  ];

  var itens = form.getItems();
  var mexeu = 0;
  for (var i = 0; i < itens.length; i++) {
    var it = itens[i];
    if (alvos.indexOf(it.getTitle()) === -1) continue;
    var tipo = it.getType();
    var q = (tipo === FormApp.ItemType.PARAGRAPH_TEXT) ? it.asParagraphTextItem()
          : (tipo === FormApp.ItemType.TEXT) ? it.asTextItem() : null;
    if (!q) { Logger.log('aviso: "' + it.getTitle() + '" tem tipo inesperado (pulei)'); continue; }
    if (q.isRequired()) {
      q.setRequired(false);
      Logger.log('OK: "' + it.getTitle() + '" agora é OPCIONAL');
      mexeu++;
    } else {
      Logger.log('já estava opcional: "' + it.getTitle() + '"');
    }
  }

  Logger.log("--------------------------------------------------");
  Logger.log(mexeu ? "Pronto! " + mexeu + " campo(s) corrigido(s)." : "Nada a corrigir — já estava tudo certo.");
  Logger.log("Agora ninguém trava ao marcar 'Sim' em 'Registrar OUTRA não conformidade'.");

  // diagnóstico: lista os campos obrigatórios que sobraram
  Logger.log("");
  Logger.log("Campos que continuam OBRIGATÓRIOS (confira se faz sentido):");
  form.getItems().forEach(function (it) {
    var t = it.getType(), q = null;
    try {
      if (t === FormApp.ItemType.TEXT) q = it.asTextItem();
      else if (t === FormApp.ItemType.PARAGRAPH_TEXT) q = it.asParagraphTextItem();
      else if (t === FormApp.ItemType.MULTIPLE_CHOICE) q = it.asMultipleChoiceItem();
      else if (t === FormApp.ItemType.LIST) q = it.asListItem();
      else if (t === FormApp.ItemType.CHECKBOX) q = it.asCheckboxItem();
      else if (t === FormApp.ItemType.DATE) q = it.asDateItem();
      if (q && q.isRequired()) Logger.log("   * " + it.getTitle());
    } catch (e) {}
  });
}

function acharFormPorNome(nome) {
  var it = DriveApp.getFilesByName(nome);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() === "application/vnd.google-apps.form") return FormApp.openById(f.getId());
  }
  return null;
}

/** Diagnóstico: lista todos os formulários da conta. */
function listarFormularios() {
  var it = DriveApp.getFilesByType("application/vnd.google-apps.form");
  Logger.log("Formulários na sua conta:");
  while (it.hasNext()) {
    var f = it.next();
    Logger.log('  - "' + f.getName() + '"  (id: ' + f.getId() + ")");
  }
}
