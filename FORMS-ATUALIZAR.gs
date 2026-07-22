/**
 * ATUALIZA O FORMULÁRIO DE INSPEÇÃO JÁ EXISTENTE — sem trocar o link.
 * Acha o formulário pelo NOME (não depende de ID), então funciona mesmo
 * que você tenha recriado o formulário.
 *
 * Aplica:
 *   - "Tipo de ocorrência": adiciona "Quase acidente"
 *   - "Responsável pela tratativa": remove o texto de ajuda
 *   - "Empresa responsável": vira lista suspensa (17 empresas + "Outro")
 *     + cria o campo "Se marcou Outro, qual empresa?"
 *   - Adiciona "Registro fotográfico (link)"
 *
 * COMO USAR:
 * 1. script.google.com > o MESMO projeto dos formulários
 * 2. Novo arquivo de script > cole ISTO
 * 3. Selecione a função "atualizarFormulario" no topo > Executar
 * 4. Autorize se pedir
 * 5. Abra o "Registro de execução" (embaixo): ele mostra tudo o que mudou.
 *    Depois RECARREGUE a página do formulário (F5). O link continua o mesmo.
 *
 * Se o log disser "formulário não encontrado", me diga o NOME exato que
 * aparece no topo do seu formulário que eu ajusto.
 */

var NOME_FORM = "Inspeção de Segurança — CEDRO MINERAÇÃO";

var EMPRESAS = [
  "Cedro", "Açofer", "AJPM", "Altto Engenharia", "Astec", "Dexplo", "DL",
  "Fênix", "Foreza", "Genvolt", "LBS", "MPC", "MR Desentupidora",
  "Rio Negro", "Sapore", "TTX", "Vordex",
];

function atualizarFormulario() {
  var form = acharFormPorNome(NOME_FORM);
  if (!form) {
    Logger.log("ERRO: não encontrei um formulário chamado \"" + NOME_FORM + "\".");
    Logger.log("Formulários na sua conta:");
    listarFormularios();
    return;
  }
  Logger.log("Formulário encontrado. Link de edição: " + form.getEditUrl());

  function idxDe(t) {
    var itens = form.getItems();
    for (var i = 0; i < itens.length; i++) if (itens[i].getTitle() === t) return i;
    return -1;
  }
  function itemDe(t) { var i = idxDe(t); return i >= 0 ? form.getItems()[i] : null; }

  // 1) Tipo de ocorrência + Quase acidente
  var tipo = itemDe("Tipo de ocorrência");
  if (tipo && tipo.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
    tipo.asMultipleChoiceItem().setChoiceValues(["Condição Insegura", "Ato Inseguro", "Quase acidente"]);
    Logger.log("OK 1/4: 'Tipo de ocorrência' agora tem Quase acidente");
  } else {
    Logger.log("aviso: não achei 'Tipo de ocorrência' (pulei)");
  }

  // 2) Responsável pela tratativa: remove ajuda
  var resp = itemDe("Responsável pela tratativa");
  if (resp) {
    resp.asTextItem().setHelpText("");
    Logger.log("OK 2/4: 'Responsável pela tratativa' sem texto de ajuda");
  } else {
    Logger.log("aviso: não achei 'Responsável pela tratativa' (pulei)");
  }

  // 3) Empresa responsável -> lista suspensa
  var empIdx = idxDe("Empresa responsável");
  if (empIdx >= 0) {
    var it = form.getItems()[empIdx];
    if (it.getType() === FormApp.ItemType.LIST) {
      it.asListItem().setChoiceValues(EMPRESAS.concat(["Outro"]));
    } else {
      form.deleteItem(it);
      var novo = form.addListItem().setTitle("Empresa responsável").setChoiceValues(EMPRESAS.concat(["Outro"]));
      form.moveItem(novo.getIndex(), empIdx);
    }
    if (idxDe('Se marcou "Outro", qual empresa?') < 0) {
      var esp = form.addTextItem().setTitle('Se marcou "Outro", qual empresa?');
      form.moveItem(esp.getIndex(), idxDe("Empresa responsável") + 1);
    }
    Logger.log("OK 3/4: 'Empresa responsável' é lista suspensa (" + EMPRESAS.length + " empresas + Outro)");
  } else {
    Logger.log("aviso: não achei 'Empresa responsável' (pulei)");
  }

  // 4) Campo de foto por link
  if (idxDe("Registro fotográfico (link)") < 0) {
    var foto = form.addTextItem().setTitle("Registro fotográfico (link)")
      .setHelpText("Cole aqui o link da foto (Google Fotos, Drive ou WhatsApp Web). Opcional.");
    var apos = idxDe("Responsável pela verificação / validação");
    if (apos >= 0) form.moveItem(foto.getIndex(), apos + 1);
    Logger.log("OK 4/4: campo 'Registro fotográfico (link)' criado");
  } else {
    Logger.log("OK 4/4: campo de foto já existia");
  }

  Logger.log("=== PRONTO! Recarregue a página do formulário (F5). O link não mudou. ===");
}

function acharFormPorNome(nome) {
  var it = DriveApp.getFilesByName(nome);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() === "application/vnd.google-apps.form") {
      return FormApp.openById(f.getId());
    }
  }
  return null;
}

/** Diagnóstico: lista todos os formulários da conta. */
function listarFormularios() {
  var it = DriveApp.getFilesByType("application/vnd.google-apps.form");
  while (it.hasNext()) {
    var f = it.next();
    Logger.log(" - \"" + f.getName() + "\"  (id: " + f.getId() + ")");
  }
}
