/**
 * ATUALIZA O FORMULÁRIO DE INSPEÇÃO JÁ EXISTENTE — sem trocar o link.
 *
 * Aplica no formulário que você já criou:
 *   - "Tipo de ocorrência": adiciona "Quase acidente"
 *   - "Responsável pela tratativa": remove o texto de ajuda
 *   - "Empresa responsável": vira lista suspensa com as 17 empresas + "Outro"
 *     (e cria o campo "Se marcou Outro, qual empresa?")
 *   - Adiciona o campo "Registro fotográfico (link)"
 *
 * COMO USAR:
 * 1. Abra script.google.com > o MESMO projeto dos formulários
 * 2. Crie um arquivo novo (ícone + > Script) e cole ISTO
 * 3. Selecione a função "atualizarFormulario" no topo e clique em Executar
 * 4. Autorize se pedir. Pronto — recarregue o formulário e veja as mudanças.
 *    O LINK continua o mesmo; não precisa reenviar para os técnicos.
 *
 * Rode UMA vez. Rodar de novo não duplica (ele confere o que já existe).
 */

// ID do formulário de INSPEÇÃO (o mesmo do link de edição que já apareceu)
var FORM_INSPECAO_ID = "11m3kG7IXWcSauPeZC3jyTeumGc2Ynm6802PdyBuHGew";

var EMPRESAS = [
  "Cedro", "Açofer", "AJPM", "Altto Engenharia", "Astec", "Dexplo", "DL",
  "Fênix", "Foreza", "Genvolt", "LBS", "MPC", "MR Desentupidora",
  "Rio Negro", "Sapore", "TTX", "Vordex",
];

function atualizarFormulario() {
  var f = FormApp.openById(FORM_INSPECAO_ID);

  function idxDe(titulo) {
    var itens = f.getItems();
    for (var i = 0; i < itens.length; i++) if (itens[i].getTitle() === titulo) return i;
    return -1;
  }
  function itemDe(titulo) {
    var i = idxDe(titulo);
    return i >= 0 ? f.getItems()[i] : null;
  }

  // 1) Tipo de ocorrência + "Quase acidente"
  var tipo = itemDe("Tipo de ocorrência");
  if (tipo) {
    tipo.asMultipleChoiceItem().setChoiceValues(["Condição Insegura", "Ato Inseguro", "Quase acidente"]);
    Logger.log("OK: Tipo de ocorrência atualizado");
  }

  // 2) Responsável pela tratativa: remover ajuda
  var resp = itemDe("Responsável pela tratativa");
  if (resp) {
    resp.asTextItem().setHelpText("");
    Logger.log("OK: Responsável pela tratativa simplificado");
  }

  // 3) Empresa responsável -> lista suspensa nova (troca no mesmo lugar)
  var empIdx = idxDe("Empresa responsável");
  if (empIdx >= 0) {
    var jaLista = f.getItems()[empIdx].getType() === FormApp.ItemType.LIST;
    // se já for lista com muitas opções, considera atualizado
    if (!jaLista) {
      f.deleteItem(f.getItems()[empIdx]);
      var novo = f.addListItem().setTitle("Empresa responsável").setChoiceValues(EMPRESAS.concat(["Outro"]));
      f.moveItem(novo.getIndex(), empIdx);
      Logger.log("OK: Empresa responsável virou lista suspensa");
    } else {
      f.getItems()[empIdx].asListItem().setChoiceValues(EMPRESAS.concat(["Outro"]));
      Logger.log("OK: Empresa responsável (lista) atualizada");
    }
    // campo "Se marcou Outro, qual empresa?" logo após
    if (idxDe('Se marcou "Outro", qual empresa?') < 0) {
      var especifica = f.addTextItem().setTitle('Se marcou "Outro", qual empresa?');
      f.moveItem(especifica.getIndex(), idxDe("Empresa responsável") + 1);
      Logger.log("OK: campo 'qual empresa?' criado");
    }
  }

  // 4) Campo de foto por link
  if (idxDe("Registro fotográfico (link)") < 0) {
    var foto = f.addTextItem().setTitle("Registro fotográfico (link)")
      .setHelpText("Cole aqui o link da foto (Google Fotos, Drive ou WhatsApp Web). Opcional.");
    var apos = idxDe("Responsável pela verificação / validação");
    if (apos >= 0) f.moveItem(foto.getIndex(), apos + 1);
    Logger.log("OK: campo de foto (link) criado");
  }

  Logger.log("Pronto! Recarregue o formulário. O link continua o mesmo.");
}
