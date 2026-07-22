#!/usr/bin/env node
/*
 * nc-mina.js — Controle de inspeções e não conformidades por área da mina.
 *
 * Fluxo: exporta a conversa do grupo do WhatsApp (sem mídia), joga o .txt
 * na pasta exports/ e roda este script (ou o rodar.bat). Ele extrai as
 * mensagens #NC e #INSPECAO, mantém as planilhas em data/ e gera o
 * dashboard.html com o status de cada área.
 *
 * Sem dependências — só Node.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------- CONFIG
const JANELA_DIAS = 15; // área sem inspeção há mais de X dias => vermelho

const EMPRESA = {
  nome: "CEDRO MINERAÇÃO",
  gerente: "Alberto",
  engenheira: "Josiane Lima",
};

// Links dos formulários online: ficam no config-forms.json (criados pelo
// FORMS-CRIAR.gs no Google). Com link preenchido, aparecem botões no dashboard.
// (carregado mais abaixo, depois de DIR ser definido)

// Áreas oficiais (mesma lista do Formulário de Inspeção)
const AREAS = [
  "Britagem 1",
  "Britagem 1A",
  "Concentração (Planta 3 + GX600)",
  "Filtragem",
  "PEC",
  "Planta 4",
  "Área de Lavra",
  "Banheiro/Vestiário Cedro ADM",
  "Banheiro/Vestiário Cedro Operacional",
  "Banheiro/Vestiário Cedro Contratadas",
  "Pátio Balança",
  "Balança",
  "Oficina AJPM",
  "Oficina MPC",
  "Restaurante",
  "Centro Administrativo",
  "Portaria",
];

// apelidos (sem acento, minúsculo) => nome canônico; ordem importa:
// os mais específicos vêm antes ("britagem 1a" antes de "britagem 1").
// Apelidos de até 3 letras (pec, mpc, adm) só casam como palavra inteira.
const AREA_ALIASES = [
  [["britagem 1a", "britagem 1 a", "brit 1a", "britagem1a"], "Britagem 1A"],
  [["britagem 1", "britagem1", "brit 1", "britagem antiga", "britagem"], "Britagem 1"],
  [["concentracao (planta 3 + gx600)", "concentracao", "planta 3", "gx600", "gx 600", "concentra"], "Concentração (Planta 3 + GX600)"],
  [["filtragem", "filtro prensa", "filtro", "prensa"], "Filtragem"],
  [["pec"], "PEC"],
  [["planta 4", "planta4"], "Planta 4"],
  [["area de lavra", "lavra", "cava"], "Área de Lavra"],
  [["banheiro/vestiario cedro adm", "vestiario cedro adm", "vestiario adm", "banheiro adm"], "Banheiro/Vestiário Cedro ADM"],
  [["banheiro/vestiario cedro operacional", "vestiario cedro operacional", "vestiario operacional", "banheiro operacional"], "Banheiro/Vestiário Cedro Operacional"],
  [["banheiro/vestiario cedro contratadas", "vestiario contratadas", "banheiro contratadas", "vestiario cedro contratadas"], "Banheiro/Vestiário Cedro Contratadas"],
  [["patio balanca", "patio da balanca"], "Pátio Balança"],
  [["balanca"], "Balança"],
  [["oficina ajpm", "ajpm"], "Oficina AJPM"],
  [["oficina mpc", "mpc"], "Oficina MPC"],
  [["restaurante", "refeitorio"], "Restaurante"],
  [["centro administrativo", "administrativo", "escritorio central"], "Centro Administrativo"],
  [["portaria", "guarita"], "Portaria"],
];

// Mapa da mina: polígonos em % da imagem planta.png (x: 0-100 esq→dir, y: 0-100 topo→base).
// "confirmado: false" = posição aproximada (aparece tracejada) — ajuste os pontos aqui.
// Áreas sem entrada aqui (PEC, Lavra, Balança, Oficinas...) ainda não têm ilha
// no mapa — marque no print de satélite e me passe para eu desenhar.
const MAPA = {
  "Britagem 1": { pontos: [[74,17],[80,15],[88,22],[94,33],[96,45],[92,58],[84,64],[74,63],[70,55],[68,40],[70,28]], rotulo: [82,40], confirmado: true },
  "Britagem 1A": { pontos: [[4,68],[8,59],[15,56],[22,58],[26,62],[33,64],[36,72],[35,84],[30,95],[20,99],[10,97],[5,88]], rotulo: [19,78], confirmado: true },
  "Planta 4": { pontos: [[52,60],[62,58],[67,64],[66,73],[58,76],[51,70]], rotulo: [59,67], confirmado: false },
  "Concentração (Planta 3 + GX600)": { pontos: [[43,33],[63,31],[65,42],[64,50],[57,53],[48,52],[43,49]], rotulo: [54,42], confirmado: true },
  "Filtragem": { pontos: [[46,25],[45,15],[48,8],[56,6],[61,10],[62,20],[60,28],[56,31],[50,30]], rotulo: [53,18], confirmado: true },
  "Centro Administrativo": { pontos: [[16,38],[28,35],[33,41],[32,51],[24,55],[16,50]], rotulo: [24,45], confirmado: false },
};

const DIR = __dirname;
const DIR_EXPORTS = path.join(DIR, "exports");
const DIR_DATA = path.join(DIR, "data");
const ARQ_NC = path.join(DIR_DATA, "nao_conformidades.csv");
const ARQ_INSP = path.join(DIR_DATA, "inspecoes.csv");
const ARQ_DASH = path.join(DIR, "dashboard.html");

const LINKS_FORMS = (() => {
  try {
    const cf = JSON.parse(fs.readFileSync(path.join(DIR, "config-forms.json"), "utf8"));
    // versão "embedded" abre o formulário dentro da própria aba do dashboard
    const embed = (u) => (u ? u.replace(/\?.*$/, "") + "?embedded=true" : "");
    return {
      inspecao: cf.inspecao_link || "",
      tratativa: cf.tratativa_link || "",
      inspecaoEmbed: embed(cf.inspecao_link),
      tratativaEmbed: embed(cf.tratativa_link),
    };
  } catch (e) {
    return { inspecao: "", tratativa: "", inspecaoEmbed: "", tratativaEmbed: "" };
  }
})();

// ---------------------------------------------------------------- util
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function fmtData(d) {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function parseDataBR(s, anoPadrao) {
  const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  let ano = m[3] ? parseInt(m[3], 10) : anoPadrao || new Date().getFullYear();
  if (ano < 100) ano += 2000;
  const d = new Date(ano, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d) ? null : d;
}

function diasDesde(d) {
  if (!d) return Infinity;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return Math.round((hoje - dd) / 86400000);
}

// ---------------------------------------------------------------- CSV
function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvWrite(arquivo, cabecalho, linhas) {
  const corpo = [cabecalho, ...linhas].map((l) => l.map(csvEscape).join(";")).join("\r\n");
  fs.writeFileSync(arquivo, "﻿" + corpo + "\r\n", "utf8"); // BOM p/ Excel PT-BR
}

function csvRead(arquivo) {
  if (!fs.existsSync(arquivo)) return [];
  const txt = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => x !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); if (linha.some((x) => x !== "")) linhas.push(linha); }
  return linhas.slice(1); // sem cabeçalho
}

// ------------------------------------------------- parse export WhatsApp
// Android: "15/07/2026 08:32 - João: mensagem"
// iPhone:  "[15/07/26, 08:32:15] João: mensagem"
const RE_ANDROID = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\s*[-–]\s+([^:]+?):\s([\s\S]*)$/;
const RE_IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]\s+([^:]+?):\s([\s\S]*)$/;

function parseChat(txt) {
  const msgs = [];
  let atual = null;
  for (const linha of txt.split(/\r?\n/)) {
    const l = linha.replace(/[‎‏‪-‮]/g, ""); // marcas invisíveis do WhatsApp
    const m = l.match(RE_ANDROID) || l.match(RE_IOS);
    if (m) {
      if (atual) msgs.push(atual);
      atual = { data: parseDataBR(m[1]), hora: m[2], autor: m[3].trim(), texto: m[4] };
    } else if (atual) {
      atual.texto += "\n" + l; // continuação de mensagem multi-linha
    }
  }
  if (atual) msgs.push(atual);
  return msgs.filter((m) => m.data);
}

// ------------------------------------------------- extração de campos
function extrairCampos(texto) {
  const campos = {};
  const mapa = [
    [/^(?:area|local)$/, "area"],
    [/^equipamento$/, "equipamento"],
    [/^(?:problema|nao conformidade|nc|descricao|desvio)$/, "descricao"],
    [/^(?:risco|classificacao|criticidade)$/, "risco"],
    [/^(?:responsavel|resp)$/, "responsavel"],
    [/^prazo$/, "prazo"],
    [/^status$/, "status"],
    [/^(?:observacao|obs)$/, "obs"],
    [/^acao imediata$/, "acaoImediata"],
    [/^(?:foto|fotos|registro fotografico|anexo)$/, "foto"],
  ];
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^\s*([^:]{2,25}?)\s*:\s*(.+)$/);
    if (!m) continue;
    const chave = norm(m[1]).replace(/^#/, "");
    for (const [re, nome] of mapa) {
      if (re.test(chave)) { campos[nome] = m[2].trim(); break; }
    }
  }
  return campos;
}

function acharArea(msg, campos) {
  const alvo = norm(campos.area || msg.texto);
  for (const [apelidos, canonico] of AREA_ALIASES) {
    for (const ap of apelidos) {
      if (ap.length <= 3) {
        // apelido curto (pec, mpc...) só vale como palavra inteira,
        // senão "pec" casaria dentro de "especifique"
        if (new RegExp(`(^|[^a-z0-9])${ap}([^a-z0-9]|$)`).test(alvo)) return canonico;
      } else if (alvo.includes(ap)) {
        return canonico;
      }
    }
  }
  return null;
}

function normRisco(s) {
  const n = norm(s);
  if (n.startsWith("crit")) return "Crítica";
  if (n.startsWith("alt")) return "Alto";
  if (n.startsWith("med") || n.startsWith("moder")) return "Médio";
  if (n.startsWith("baix")) return "Baixo";
  return s ? s.trim() : "";
}

// ------------------------------------------------- classificação de msg
function processar(msgs) {
  const ncs = [];
  const inspecoes = [];
  const acompanhamentos = [];
  for (const msg of msgs) {
    const t = norm(msg.texto);
    const campos = extrairCampos(msg.texto);
    const area = acharArea(msg, campos);

    // #ACOMPANHAMENTO — atualiza status de uma NC já registrada.
    // Pode referenciar pelo número (NC: NC-0042) — aí nem precisa da área.
    // A área vem SÓ do campo "Área:" explícito (texto livre da observação
    // poderia citar outra área/empresa e confundir, ex.: "AJPM").
    if (t.includes("#acompanhamento")) {
      if (!campos.descricao) continue;
      const areaAcomp = campos.area ? acharArea(msg, campos) : null;
      const temNumero = /nc\s*-?\s*\d/.test(norm(campos.descricao));
      if (!areaAcomp && !temNumero) continue;
      acompanhamentos.push({
        data: msg.data, area: areaAcomp || "", ref: campos.descricao,
        status: campos.status || "", obs: campos.obs || "", tecnico: msg.autor,
      });
      if (areaAcomp) inspecoes.push({ data: fmtData(msg.data), hora: msg.hora, tecnico: msg.autor, area: areaAcomp, tipo: "Acompanhamento" });
      continue;
    }

    // #INSPEÇÃO GERAL — várias "Área:" na mesma mensagem
    const linhasArea = msg.texto.split("\n")
      .map((l) => l.match(/^\s*(?:área|area|local)\s*:\s*(.+)$/i))
      .filter(Boolean).map((m) => m[1]);
    if (linhasArea.length >= 2 || t.includes("inspecao geral")) {
      const vistas = new Set();
      for (const la of linhasArea) {
        const a = acharArea({ texto: la }, { area: la });
        if (a && !vistas.has(a)) {
          vistas.add(a);
          inspecoes.push({ data: fmtData(msg.data), hora: msg.hora, tecnico: msg.autor, area: a, tipo: "Rotina" });
        }
      }
      if (vistas.size) continue;
    }

    if (!area) continue;

    const ehNC = t.includes("#nc") || (campos.area && campos.descricao);
    const ehInspecaoOK =
      t.includes("#inspecao") || t.includes("#ok") ||
      t.includes("sem nc") || t.includes("sem nao conformidade") ||
      t.includes("tudo ok") || t.includes("tudo certo") || t.includes("area ok");

    if (ehNC) {
      let desc = campos.descricao;
      if (!desc) {
        // #NC sem campo Problema: usa o texto livre depois da tag
        desc = msg.texto.replace(/#nc/i, "").split("\n").map((x) => x.trim())
          .filter((x) => x && !/^\s*(area|local|foto)\s*:/i.test(x)).join(" ").trim();
        // tira o nome da área do começo do texto livre ("britagem 2 - guarda solta" => "guarda solta")
        for (const [apelidos] of AREA_ALIASES) {
          for (const ap of apelidos) {
            if (norm(desc.slice(0, ap.length)) === ap) { desc = desc.slice(ap.length).replace(/^[\s\-–:,.]+/, ""); break; }
          }
        }
      }
      if (!desc) continue;
      const id = hashId(fmtData(msg.data) + "|" + area + "|" + norm(desc).slice(0, 80));
      ncs.push({
        id,
        dataRegistro: fmtData(msg.data),
        tecnico: msg.autor,
        area,
        equipamento: campos.equipamento || "",
        descricao: desc,
        risco: normRisco(campos.risco),
        responsavel: campos.responsavel || "",
        prazo: campos.prazo ? fmtData(parseDataBR(campos.prazo, msg.data.getFullYear())) : "",
        status: "Aberta",
        obs: campos.acaoImediata ? `Ação imediata: ${campos.acaoImediata}` : (campos.obs || ""),
        // só guarda foto se for link (WhatsApp manda "(arquivo anexado)", que ignoramos)
        foto: /^https?:\/\//i.test(String(campos.foto || "").trim()) ? campos.foto.trim() : "",
      });
      inspecoes.push({ data: fmtData(msg.data), hora: msg.hora, tecnico: msg.autor, area, tipo: "NC" });
    } else if (ehInspecaoOK) {
      inspecoes.push({ data: fmtData(msg.data), hora: msg.hora, tecnico: msg.autor, area, tipo: "Rotina" });
    }
  }
  return { ncs, inspecoes, acompanhamentos };
}

// ------------------------------------------------- acompanhamentos
function normStatusAcomp(s) {
  const n = norm(s);
  if (/^(conclu|encerr|resolvid|atendid|fechad|ok)/.test(n)) return "Encerrada";
  if (n.includes("andamento")) return "Em andamento";
  if (n.includes("sem atendimento") || n.includes("nao iniciad")) return "Aberta";
  return "";
}

function aplicarAcompanhamentos(todas, acomps) {
  let aplicados = 0;
  const ordenados = [...acomps].sort((a, b) => a.data - b.data);
  for (const ac of ordenados) {
    let melhor = null;
    // 1º: referência direta pelo número da NC ("NC: NC-0042" ou "NC 42") — não depende da área
    const mNum = norm(ac.ref).match(/nc\s*-?\s*0*(\d+)/);
    if (mNum) {
      const alvoNum = parseInt(mNum[1], 10);
      melhor = todas.find((n) => n.numero && parseInt(String(n.numero).replace(/\D/g, ""), 10) === alvoNum) || null;
    }
    // 2º: casamento por área + palavras da descrição
    if (!melhor) {
      const toks = norm(ac.ref).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
      if (!toks.length) continue;
      let melhorScore = 0;
      for (const n of todas) {
        if (ac.area && n.area !== ac.area) continue;
        const reg = parseDataBR(n.dataRegistro);
        if (reg && reg > ac.data) continue; // NC registrada depois do acompanhamento
        const alvo = norm(n.descricao + " " + n.equipamento);
        const score = toks.filter((w) => alvo.includes(w)).length;
        if (score > melhorScore) { melhor = n; melhorScore = score; }
      }
    }
    if (!melhor) continue;
    const novoStatus = normStatusAcomp(ac.status);
    if (!novoStatus) continue;
    // não reabre NC já encerrada (ex.: encerrada manualmente no Excel)
    if (statusFechado(melhor.status) && novoStatus !== "Encerrada") continue;
    melhor.status = novoStatus === "Encerrada" ? `Encerrada em ${fmtData(ac.data)}` : novoStatus;
    if (ac.obs && !String(melhor.obs).includes(ac.obs)) {
      melhor.obs = melhor.obs ? `${melhor.obs} | ${ac.obs}` : ac.obs;
    }
    aplicados++;
  }
  return aplicados;
}

// ------------------------------------------------- merge com planilhas
const CAB_NC = ["ID", "Numero", "DataRegistro", "Tecnico", "Area", "Equipamento", "Descricao", "Risco", "Responsavel", "Prazo", "Status", "Observacao", "Inspecao", "Foto"];
const CAB_INSP = ["Numero", "Data", "Hora", "Tecnico", "Area", "Tipo"];

function mergeNCs(novas) {
  const existentes = csvRead(ARQ_NC).map((l) => {
    // formato novo (com coluna Numero) ou antigo (sem) — migra sozinho
    if (String(l[1] || "").startsWith("NC-")) {
      return {
        id: l[0], numero: l[1], dataRegistro: l[2], tecnico: l[3], area: l[4], equipamento: l[5],
        descricao: l[6], risco: l[7], responsavel: l[8], prazo: l[9],
        status: l[10] || "Aberta", obs: l[11] || "", inspecao: l[12] || "", foto: l[13] || "",
      };
    }
    return {
      id: l[0], numero: "", dataRegistro: l[1], tecnico: l[2], area: l[3], equipamento: l[4],
      descricao: l[5], risco: l[6], responsavel: l[7], prazo: l[8],
      status: l[9] || "Aberta", obs: l[10] || "", inspecao: "", foto: "",
    };
  });
  const porId = new Map(existentes.map((n) => [n.id, n]));
  let adicionadas = 0;
  for (const nc of novas) {
    if (!porId.has(nc.id)) { porId.set(nc.id, nc); adicionadas++; }
  }
  const todas = [...porId.values()].sort((a, b) => {
    const da = parseDataBR(a.dataRegistro), db = parseDataBR(b.dataRegistro);
    return (db || 0) - (da || 0);
  });
  return { todas, adicionadas };
}

function gravarNCs(todas) {
  csvWrite(ARQ_NC, CAB_NC, todas.map((n) => [n.id, n.numero || "", n.dataRegistro, n.tecnico, n.area, n.equipamento, n.descricao, n.risco, n.responsavel, n.prazo, n.status, n.obs, n.inspecao || "", n.foto || ""]));
}

function mergeInspecoes(novas) {
  const existentes = csvRead(ARQ_INSP).map((l) => {
    if (String(l[0] || "").startsWith("INS-")) {
      return { numero: l[0], data: l[1], hora: l[2], tecnico: l[3], area: l[4], tipo: l[5] };
    }
    return { numero: "", data: l[0], hora: l[1], tecnico: l[2], area: l[3], tipo: l[4] }; // formato antigo
  });
  const chave = (i) => `${i.data}|${i.hora}|${norm(i.tecnico)}|${i.area}`;
  const porChave = new Map(existentes.map((i) => [chave(i), i]));
  let adicionadas = 0;
  for (const i of novas) {
    if (!porChave.has(chave(i))) { porChave.set(chave(i), i); adicionadas++; }
  }
  const todas = [...porChave.values()].sort((a, b) => (parseDataBR(b.data) || 0) - (parseDataBR(a.data) || 0));
  return { todas, adicionadas };
}

function gravarInspecoes(todas) {
  csvWrite(ARQ_INSP, CAB_INSP, todas.map((i) => [i.numero || "", i.data, i.hora, i.tecnico, i.area, i.tipo]));
}

// ------------------------------------------------- numeração sequencial
// NC-0001, NC-0002... e INS-0001, INS-0002... — o número nunca muda depois
// de atribuído; novos registros continuam a sequência. Também vincula cada
// NC à inspeção (mesma data + técnico + área).
function numerarRegistros(ncs, inspecoes) {
  const maxSeq = (lista, campo) => {
    let max = 0;
    for (const r of lista) {
      const m = String(r[campo] || "").match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
  };
  const cronologico = (a, b, da, db) => (da || 0) - (db || 0);

  let seq = maxSeq(inspecoes, "numero");
  [...inspecoes]
    .sort((a, b) => cronologico(a, b, parseDataBR(a.data), parseDataBR(b.data)) || String(a.hora).localeCompare(String(b.hora)))
    .forEach((i) => { if (!i.numero) i.numero = "INS-" + String(++seq).padStart(4, "0"); });

  let seqNC = maxSeq(ncs, "numero");
  [...ncs]
    .sort((a, b) => cronologico(a, b, parseDataBR(a.dataRegistro), parseDataBR(b.dataRegistro)))
    .forEach((n) => { if (!n.numero) n.numero = "NC-" + String(++seqNC).padStart(4, "0"); });

  for (const n of ncs) {
    if (n.inspecao) continue;
    const insp = inspecoes.find((i) => i.data === n.dataRegistro && norm(i.tecnico) === norm(n.tecnico) && i.area === n.area && i.tipo === "NC")
      || inspecoes.find((i) => i.data === n.dataRegistro && norm(i.tecnico) === norm(n.tecnico) && i.area === n.area);
    if (insp) n.inspecao = insp.numero;
  }
}

// ------------------------------------------------- status por área
function statusFechado(s) {
  const n = norm(s);
  return n.startsWith("encerr") || n.startsWith("fech") || n.startsWith("conclu") || n.startsWith("resolv");
}

function calcularAreas(ncs, inspecoes) {
  return AREAS.map((area) => {
    const insp = inspecoes.filter((i) => i.area === area);
    const ultima = insp.map((i) => parseDataBR(i.data)).filter(Boolean).sort((a, b) => b - a)[0] || null;
    const dias = diasDesde(ultima);
    const abertas = ncs.filter((n) => n.area === area && !statusFechado(n.status));
    const vencidas = abertas.filter((n) => {
      const p = parseDataBR(n.prazo);
      return p && diasDesde(p) > 0;
    });
    let status, rotulo;
    if (dias > JANELA_DIAS) { status = "vermelho"; rotulo = "Sem inspeção"; }
    else if (vencidas.length) { status = "vermelho"; rotulo = "NC vencida"; }
    else if (abertas.length) { status = "amarelo"; rotulo = "Pendências abertas"; }
    else { status = "verde"; rotulo = "Em dia"; }
    return { area, ultima, dias, abertas, vencidas, status, rotulo, totalInsp: insp.length };
  });
}

// ------------------------------------------------- equipamentos (base de manutenção)
// códigos curtos do tipo TC01, BP04R, PN03A extraídos da tag/nome, para casar com o texto das NCs
function codigosEquip(e) {
  const codes = new Set();
  for (const fonte of [e.tag, e.nome]) {
    for (const m of String(fonte || "").toUpperCase().matchAll(/([A-Z]{2,4})[\s\-.]*([0-9]{1,3}[A-Z]?)/g)) {
      codes.add((m[1] + m[2]).toLowerCase());
    }
  }
  return [...codes].filter((c) => c.length >= 4);
}

function cruzarEquipamentosComNCs(equipamentos, ncs) {
  const canon = (s) => norm(s).replace(/[^a-z0-9]/g, "");
  for (const e of equipamentos) {
    const codes = codigosEquip(e);
    const nomeCanon = canon(e.nome);
    const casadas = ncs.filter((n) => {
      if (e.area && n.area && e.area !== n.area) return false; // PN-01 da Britagem != PN-01 da Concentração
      const alvo = canon(`${n.equipamento} ${n.descricao}`);
      return codes.some((c) => alvo.includes(c)) || (nomeCanon.length >= 6 && alvo.includes(nomeCanon));
    });
    e.ncsTotal = casadas.length;
    e.ncsAbertas = casadas.filter((n) => !statusFechado(n.status)).length;
    e.ncsInfo = casadas.slice(0, 5).map((n) => ({
      descricao: n.descricao, status: n.status, tecnico: n.tecnico, dataRegistro: n.dataRegistro, prazo: n.prazo,
    }));
    for (const n of casadas) {
      n.equipTags = n.equipTags || [];
      if (!n.equipTags.includes(e.tag)) n.equipTags.push(e.tag);
    }
  }
  return equipamentos;
}

// liga as solicitações de compra EM ABERTO a cada equipamento (pelo código na TAG/texto)
function ligarFluxoAEquipamentos(equipamentos, fluxoAbertas) {
  const canon = (s) => norm(s).replace(/[^a-z0-9]/g, "");
  for (const e of equipamentos) {
    const codes = codigosEquip(e);
    const nomeCanon = canon(e.nome);
    const casadas = fluxoAbertas.filter((s) => {
      if (s.setor !== "Elétrica" && e.area && s.setor !== e.area) return false;
      const alvo = canon(`${s.tag} ${s.texto}`);
      return codes.some((c) => alvo.includes(c)) || (nomeCanon.length >= 6 && alvo.includes(nomeCanon));
    });
    e.fluxoTotal = casadas.length;
    e.fluxoItems = casadas.slice(0, 3).map((s) => ({
      texto: s.texto, tag: s.tag, analista: s.analista, leadTime: s.leadTime, solicitante: s.solicitante, data: s.data,
    }));
  }
}

// ------------------------------------------------- fluxo de solicitações (manutenção/compras)
// liga cada NC às solicitações EM ABERTO que parecem tratar do mesmo assunto:
// mesmo código de equipamento (TC-01, BP-04...) OU 2+ palavras-chave em comum
function cruzarFluxoComNCs(ncs, solicitacoes) {
  const canon = (s) => norm(s).replace(/[^a-z0-9]/g, "");
  const toks = (s) => [...new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5))];
  const abertas = solicitacoes.filter((s) => s.status === "Em aberto");
  for (const s of abertas) {
    s.codes = codigosEquip({ tag: s.tag, nome: s.texto });
    s.toks = toks(s.texto);
  }
  for (const n of ncs) {
    const alvoCanon = canon(`${n.equipamento} ${n.descricao}`);
    const alvoToks = toks(`${n.equipamento} ${n.descricao}`);
    const casadas = abertas.filter((s) => {
      const codeHit = s.codes.some((c) => alvoCanon.includes(c));
      const tokHits = s.toks.filter((t) => alvoToks.includes(t)).length;
      return codeHit || tokHits >= 2;
    });
    if (casadas.length) {
      n.fluxo = casadas.slice(0, 3).map((s) => ({
        setor: s.setor, texto: s.texto, tag: s.tag, solicitante: s.solicitante,
        analista: s.analista, leadTime: s.leadTime, data: s.data, ordem: s.ordem, oc: s.oc,
      }));
    }
  }
  for (const s of abertas) { delete s.codes; delete s.toks; }
  return abertas;
}

// ------------------------------------------------- dashboard HTML
function gerarDashboard(areas, ncs, inspecoes, equipamentos, fluxoAbertas) {
  const hoje = new Date();
  fluxoAbertas = fluxoAbertas || [];
  const naJanela = (d) => diasDesde(parseDataBR(d)) <= JANELA_DIAS;
  const inspJanela = inspecoes.filter((i) => naJanela(i.data));
  const abertas = ncs.filter((n) => !statusFechado(n.status));
  const encerradas = ncs.filter((n) => statusFechado(n.status));
  const vencidas = abertas.filter((n) => { const p = parseDataBR(n.prazo); return p && diasDesde(p) > 0; });
  const emDia = areas.filter((a) => a.status === "verde").length;

  const porTecnico = {};
  for (const i of inspecoes) {
    porTecnico[i.tecnico] = porTecnico[i.tecnico] || { insp: 0, ncs: 0, resolvidas: 0, leads: [] };
    porTecnico[i.tecnico].insp++;
    if (i.tipo === "NC") porTecnico[i.tecnico].ncs++;
  }
  // NCs resolvidas e lead time (lançada -> encerrada) por técnico.
  // O lead só é medido quando o encerramento tem data ("Encerrada em dd/mm/aaaa",
  // que o #ACOMPANHAMENTO grava sozinho) — encerramento manual sem data fica de fora.
  const RE_ENC = /encerrada em (\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const leadsGlobais = [];
  let resolvidasNoPrazo = 0, resolvidasComPrazo = 0;
  for (const n of ncs) {
    if (!statusFechado(n.status)) continue;
    const t = porTecnico[n.tecnico];
    if (t) t.resolvidas++;
    const m = String(n.status).match(RE_ENC);
    if (!m) continue;
    const d1 = parseDataBR(n.dataRegistro), d2 = parseDataBR(m[1]);
    if (d1 && d2 && d2 >= d1) {
      const dias = Math.round((d2 - d1) / 86400000);
      if (t) t.leads.push(dias);
      leadsGlobais.push(dias);
      const p = parseDataBR(n.prazo);
      if (p) { resolvidasComPrazo++; if (d2 <= p) resolvidasNoPrazo++; }
    }
  }
  const media = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const leadGlobal = media(leadsGlobais);
  const rankTec = Object.entries(porTecnico).sort((a, b) => b[1].insp - a[1].insp);

  const ncPorArea = AREAS.map((a) => ({ area: a, n: ncs.filter((x) => x.area === a).length }));
  const maxNC = Math.max(1, ...ncPorArea.map((x) => x.n));

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ICONES = { verde: "✓", amarelo: "!", vermelho: "✕" };

  // --- mapa da mina (se planta.png existir na pasta do projeto)
  let mapaHtml = "";
  const arqPlanta = path.join(DIR, "planta.png");
  if (fs.existsSync(arqPlanta)) {
    const b64 = fs.readFileSync(arqPlanta).toString("base64");
    const CORES = { verde: "var(--good)", amarelo: "var(--warn)", vermelho: "var(--crit)" };
    const polys = [], labels = [];
    for (const a of areas) {
      const m = MAPA[a.area];
      if (!m) continue;
      const pts = m.pontos.map(([x, y]) => `${x},${y}`).join(" ");
      const cor = CORES[a.status];
      const pulseClass = a.status === "vermelho" ? " poly-pulse-red" : (a.status === "amarelo" ? " poly-pulse-yellow" : "");
      
      polys.push(`<polygon points="${pts}" class="mapa-poly${m.confirmado ? "" : " poly-aprox"}${pulseClass}" data-area="${esc(a.area)}" style="fill:${cor};stroke:${cor};--glow-color:${cor}"></polygon>`);
      labels.push(`<div class="mapa-lbl" style="left:${m.rotulo[0]}%;top:${m.rotulo[1]}%" data-area="${esc(a.area)}">
        <span class="dot" style="background:${cor}">${ICONES[a.status]}</span>${esc(a.area)}</div>`);
    }
    mapaHtml = `
<div class="card painel-mapa">
  <div class="panel-header">
    <div class="panel-title-wrap">
      <span class="icon">🛰️</span>
      <h2>Visualização de Satélite & Layout da Mina</h2>
    </div>
    <div class="map-legend">
      <span class="leg-item"><span class="leg-dot bg-good"></span> Em Dia</span>
      <span class="leg-item"><span class="leg-dot bg-warn"></span> Pendências</span>
      <span class="leg-item"><span class="leg-dot bg-crit pulsating"></span> Risco/Atrasado</span>
    </div>
  </div>
  <div class="mapa-wrap">
    <img src="data:image/png;base64,${b64}" alt="Planta da mina — vista superior">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">${polys.join("")}</svg>
    ${labels.join("")}
  </div>
</div>`;
  }

  const cards = areas.map((a) => `
    <div class="card card-area st-${a.status}" data-area="${esc(a.area)}">
      <div class="card-top">
        <h3>${esc(a.area)}</h3>
        <span class="pill pill-${a.status}"><b>${ICONES[a.status]}</b> ${esc(a.rotulo)}</span>
      </div>
      <div class="card-meta">Última inspeção: <b>${a.ultima ? fmtData(a.ultima) + (a.dias > 0 ? ` (há ${a.dias} d)` : a.dias === 0 ? " (hoje)" : "") : "nunca"}</b></div>
      <div class="card-nums">
        <div><span class="num">${a.abertas.length}</span><span class="lbl">NC abertas</span></div>
        <div><span class="num ${a.vencidas.length ? "num-bad" : ""}">${a.vencidas.length}</span><span class="lbl">Vencidas</span></div>
        <div><span class="num">${a.totalInsp}</span><span class="lbl">Total Visitas</span></div>
      </div>
    </div>`).join("");

  const barras = ncPorArea.map((x) => `
    <div class="bar-row">
      <span class="bar-lbl">${esc(x.area)}</span>
      <div class="bar-track"><div class="bar" style="width:${(x.n / maxNC) * 100}%${x.n === 0 ? ";min-width:0" : ""}"></div></div>
      <span class="bar-val">${x.n}</span>
    </div>`).join("");

  const linhasNC = abertas
    .sort((a, b) => (parseDataBR(a.prazo) || Infinity) - (parseDataBR(b.prazo) || Infinity))
    .map((n) => {
      const p = parseDataBR(n.prazo);
      const venc = p && diasDesde(p) > 0;
      const riscoClass = norm(n.risco).startsWith("crit") ? "badge-crit" : (norm(n.risco).startsWith("alt") ? "badge-alt" : (norm(n.risco).startsWith("med") ? "badge-med" : "badge-low"));
      return `<tr class="${venc ? "linha-venc" : ""}" data-area-name="${esc(n.area)}" data-risco="${esc(n.risco)}" data-resp="${esc(n.responsavel)}">
        <td class="tabular bold" style="color:var(--bar)">${esc(n.numero || "")}</td>
        <td class="bold">${esc(n.area)}</td>
        <td>${esc(n.descricao)}</td>
        <td><code class="equip-code">${esc(n.equipamento) || "-"}</code></td>
        <td><span class="badge ${riscoClass}">${esc(n.risco) || "Médio"}</span></td>
        <td><span class="resp-tag">${esc(n.responsavel) || "-"}</span></td>
        <td class="tabular">${esc(n.prazo)}${venc ? " <span class='venc-warn'>⚠ vencida</span>" : ""}</td>
        <td><span class="status-pill">${esc(n.status)}</span></td>
        <td class="tabular">${esc(n.dataRegistro)}</td>
        <td>${esc(n.tecnico)}</td>
      </tr>`;
    }).join("");

  const linhasTec = rankTec.map(([t, v]) => {
    const lead = media(v.leads);
    return `<tr class="tec-row" data-tec="${esc(t)}" style="cursor:pointer">
      <td class="bold">${esc(t)}</td>
      <td class="tabular">${v.insp}</td>
      <td class="tabular">${v.ncs}</td>
      <td class="tabular" style="color:var(--good);font-weight:700">${v.resolvidas}</td>
      <td class="tabular">${lead != null ? lead + " d" : "—"}</td>
    </tr>`;
  }).join("");

  // --- gargalos do fluxo de solicitações (manutenção/compras)
  const codigoOrdem = (s) => {
    for (const v of [s.ordem, s.oc]) {
      const m = String(v || "").match(/^[A-Za-z]{1,3}[\s\-]?\d+[\w\-\/,\s]*$/);
      if (m) return String(v).trim();
    }
    return "";
  };
  let gargalosHtml = "";
  if (fluxoAbertas.length || abertas.length) {
    // NCs abertas por equipe responsável — a quem a segurança precisa cobrar
    const porEquipe = {};
    for (const n of abertas) {
      const r = n.responsavel || "Não definido";
      const e = (porEquipe[r] = porEquipe[r] || { abertas: 0, vencidas: 0, maisAntiga: 0, comSC: 0 });
      e.abertas++;
      const p = parseDataBR(n.prazo);
      if (p && diasDesde(p) > 0) e.vencidas++;
      const idade = diasDesde(parseDataBR(n.dataRegistro));
      if (idade !== Infinity && idade > e.maisAntiga) e.maisAntiga = idade;
      if (n.fluxo && n.fluxo.length) e.comSC++;
    }
    const rankEquipe = Object.entries(porEquipe).sort((a, b) => (b[1].vencidas - a[1].vencidas) || (b[1].abertas - a[1].abertas));

    const porAnalista = {};
    for (const s of fluxoAbertas) {
      const a = (s.analista || "Sem analista definido").toUpperCase();
      porAnalista[a] = porAnalista[a] || { qtd: 0, soma: 0 };
      porAnalista[a].qtd++;
      porAnalista[a].soma += s.leadTime || 0;
    }
    const rankAnalista = Object.entries(porAnalista).sort((a, b) => b[1].qtd - a[1].qtd);
    const maisAntigas = [...fluxoAbertas].sort((a, b) => (b.leadTime || 0) - (a.leadTime || 0)).slice(0, 10);
    gargalosHtml = `
<div class="card" style="margin-top: 10px;">
  <h2 class="section-title"><span>🚦</span> Painel de Cobrança — quem a segurança precisa acionar</h2>
  <div class="cobranca-grid">
    <div>
      <h3 class="cobranca-sub">🔧 NCs abertas por equipe responsável</h3>
      <div class="table-container">
        <table>
          <thead><tr><th>Equipe</th><th>Abertas</th><th>Vencidas</th><th>Mais antiga</th><th>Já em compra</th></tr></thead>
          <tbody>${rankEquipe.map(([r, v]) => `<tr>
            <td class="bold">${esc(r)}</td>
            <td class="tabular">${v.abertas}</td>
            <td class="tabular"${v.vencidas ? ' style="color:var(--crit);font-weight:700"' : ""}>${v.vencidas}</td>
            <td class="tabular">${v.maisAntiga} d</td>
            <td class="tabular"${v.comSC ? ' style="color:var(--bar);font-weight:700"' : ""}>${v.comSC}/${v.abertas}</td>
          </tr>`).join("") || '<tr><td colspan="5">Nenhuma NC aberta 🎉</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div>
      <h3 class="cobranca-sub">🛒 Compras — está com quem?</h3>
      <div class="table-container">
        <table>
          <thead><tr><th>Analista</th><th>Em aberto</th><th>Lead médio</th></tr></thead>
          <tbody>${rankAnalista.map(([a, v]) => `<tr>
            <td class="bold">${esc(a)}</td>
            <td class="tabular">${v.qtd}</td>
            <td class="tabular">${v.qtd ? Math.round(v.soma / v.qtd) : 0} d</td>
          </tr>`).join("") || '<tr><td colspan="3">Sem solicitações em aberto</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div>
      <h3 class="cobranca-sub">⏳ Compras mais paradas (${fluxoAbertas.length} em aberto)</h3>
      <div class="table-container">
        <table>
          <thead><tr><th>Item</th><th>Setor</th><th>Solicitante</th><th>Analista</th><th>Aguardando</th><th>SC/OC</th></tr></thead>
          <tbody>${maisAntigas.map((s) => `<tr>
            <td>${esc(String(s.texto).slice(0, 55))}</td>
            <td>${esc(s.setor)}</td>
            <td>${esc(s.solicitante)}</td>
            <td>${esc(s.analista || "—")}</td>
            <td class="tabular" style="color:var(--crit);font-weight:700">${s.leadTime != null ? s.leadTime + " d" : "—"}</td>
            <td class="tabular">${esc(codigoOrdem(s) || "—")}</td>
          </tr>`).join("") || '<tr><td colspan="6">Sem solicitações em aberto</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div>
  <p style="color:var(--text-muted);font-size:11px;margin:10px 0 0;">"Já em compra" = NCs abertas que têm solicitação correspondente na manutenção. Fonte do fluxo: planilhas ACOMPANHAMENTO DAS SOLICITAÇÕES; lead time = dias aguardando material conforme a planilha.</p>
</div>`;
  }

  // --- radar de equipamentos (base de manutenção)
  let radarEquip = "";
  if (equipamentos && equipamentos.length) {
    const ordenados = [...equipamentos]
      .sort((a, b) => (b.ncsAbertas - a.ncsAbertas) || (b.atencao - a.atencao) ||
        ((b.fluxoTotal || 0) - (a.fluxoTotal || 0)) || (b.ncsTotal - a.ncsTotal));
    radarEquip = `
    <div class="card">
      <h2 class="section-title"><span>⚙️</span> Radar de Equipamentos (${equipamentos.length} na base)</h2>
      <p style="color:var(--text-muted);font-size:11px;margin:2px 0 0;">Clique num equipamento para acender a área no mapa e ver as NCs e o fluxo dele.</p>
      <div style="margin-top: 10px; max-height: 360px; overflow-y: auto;" class="table-container">
        <table>
          <thead><tr><th>Tag</th><th>Sector</th><th>NC Abertas</th><th>Peças em Atenção</th><th>Compras</th></tr></thead>
          <tbody>${ordenados.map((e) => `<tr class="equip-row" data-tag="${esc(e.tag)}" style="cursor:pointer">
            <td class="bold"><code class="equip-code">${esc(e.tag)}</code></td>
            <td>${esc(e.area || "-")}</td>
            <td class="tabular"${e.ncsAbertas ? ' style="color:var(--crit);font-weight:700"' : ""}>${e.ncsAbertas}</td>
            <td class="tabular"${e.atencao ? ' style="color:var(--warn);font-weight:700"' : ""}>${e.atencao}</td>
            <td class="tabular"${e.fluxoTotal ? ' style="color:var(--bar);font-weight:700"' : ""}>${e.fluxoTotal || 0}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
    </div>`;
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(EMPRESA.nome)} — Controle de Inspeções</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-base: #090c15;
    --bg-surface: #111524;
    --bg-surface-hover: #191f33;
    --bg-card: rgba(17, 21, 36, 0.7);
    --border-color: rgba(255, 255, 255, 0.08);
    --border-color-hover: rgba(255, 255, 255, 0.15);
    --text-primary: #f3f4f6;
    --text-secondary: #a1a8b9;
    --text-muted: #626d85;
    --good: #10b981;
    --warn: #f59e0b;
    --crit: #ef4444;
    --bar: #3b82f6;
    --card-shadow: 0 4px 20px rgba(0,0,0,0.3);
    --font-main: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
  }
  
  body.light-theme {
    --bg-base: #f3f4f6;
    --bg-surface: #ffffff;
    --bg-surface-hover: #f9fafb;
    --bg-card: rgba(255, 255, 255, 0.95);
    --border-color: rgba(0, 0, 0, 0.08);
    --border-color-hover: rgba(0, 0, 0, 0.15);
    --text-primary: #111827;
    --text-secondary: #4b5563;
    --text-muted: #9ca3af;
    --card-shadow: 0 4px 15px rgba(0,0,0,0.05);
  }

  * { box-sizing: border-box; }
  body { 
    margin: 0; 
    padding: 24px; 
    background: var(--bg-base); 
    color: var(--text-primary);
    font-family: var(--font-main);
    line-height: 1.5;
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* Topbar fixo — empresa e gestão */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 900;
    margin: -24px -24px 20px;
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-color);
    box-shadow: 0 4px 18px rgba(0,0,0,0.25);
  }
  body.light-theme .topbar {
    box-shadow: 0 4px 14px rgba(0,0,0,0.06);
  }
  .topbar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .topbar-brand .mine-icon { font-size: 20px; }
  .topbar-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    background: rgba(59, 130, 246, 0.08);
    padding: 3px 8px;
    border-radius: 99px;
  }
  .topbar-people {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 12px;
    color: var(--text-secondary);
    flex-wrap: wrap;
  }
  .topbar-people b {
    color: var(--text-primary);
    font-weight: 700;
  }
  .topbar-people .cargo {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .topbar-people .cargo-icon {
    width: 26px; height: 26px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid var(--border-color);
  }
  @media print {
    .topbar { position: static; box-shadow: none; }
  }

  /* Header Styles */
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
  }
  .title-area h1 {
    font-size: 24px;
    font-weight: 800;
    margin: 0;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, var(--text-primary) 30%, var(--text-secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .title-area .sub {
    color: var(--text-secondary);
    font-size: 13px;
    margin: 4px 0 0;
  }
  .header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .btn-theme {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
  }
  .btn-theme:hover {
    border-color: var(--border-color-hover);
    background: var(--bg-surface-hover);
  }
  .btn-form { text-decoration: none; font-weight: 700; }

  /* Abas do topo: Painel / Nova Inspeção / Tratar NC */
  .abas-topo {
    display: flex;
    gap: 6px;
    margin: 0 0 20px;
    border-bottom: 1px solid var(--border-color);
    flex-wrap: wrap;
  }
  .aba-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-family: var(--font-main);
    font-size: 14px;
    font-weight: 600;
    padding: 10px 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: -1px;
  }
  .aba-btn:hover { color: var(--text-primary); background: var(--bg-surface-hover); border-radius: 8px 8px 0 0; }
  .aba-btn.active { color: var(--bar); border-bottom-color: var(--bar); }
  .view { display: none; }
  .view.active { display: block; }
  .form-card { max-width: 900px; margin: 0 auto; }
  .form-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .form-dica { color: var(--text-secondary); font-size: 13px; margin: 8px 0 14px; }
  .form-frame {
    width: 100%;
    height: 78vh;
    min-height: 560px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: #fff;
  }
  @media print { .abas-topo, .form-frame { display: none !important; } .view { display: block !important; } }

  /* Manual "Como usar" */
  .manual { max-width: 1100px; margin: 0 auto; }
  .manual-titulo { font-size: 22px; font-weight: 800; margin: 0 0 6px; }
  .manual-intro { color: var(--text-secondary); font-size: 14px; margin: 0 0 18px; max-width: 760px; }
  .manual-h3 {
    font-size: 15px; font-weight: 800; margin: 30px 0 12px; padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }
  .manual-p { color: var(--text-secondary); font-size: 13px; margin: 0 0 12px; }
  .manual-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
  .manual-card {
    background: var(--bg-card); border: 1px solid var(--border-color);
    border-radius: 12px; padding: 16px; box-shadow: var(--card-shadow);
  }
  .manual-card h4 { margin: 0 0 8px; font-size: 14px; font-weight: 700; }
  .manual-card p { margin: 0 0 8px; font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
  .manual-card ul, .manual-lista { margin: 8px 0 0; padding-left: 18px; }
  .manual-card li, .manual-lista li {
    font-size: 13px; color: var(--text-secondary); margin-bottom: 7px; line-height: 1.55;
  }
  .manual-card b, .manual-lista b, .manual-p b, .manual-intro b { color: var(--text-primary); }
  .manual-aviso { color: var(--warn) !important; font-weight: 600; font-size: 12px !important; margin-top: 10px !important; }
  .manual-tabela { width: 100%; border-collapse: collapse; background: var(--bg-card);
    border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; }
  .manual-tabela td { padding: 14px 16px; border-bottom: 1px solid var(--border-color);
    font-size: 13px; color: var(--text-secondary); vertical-align: middle; line-height: 1.55; }
  .manual-tabela td:first-child { width: 210px; white-space: nowrap; }
  .manual-tabela tr:last-child td { border-bottom: none; }
  .manual-tabela b { color: var(--text-primary); }
  .manual-box {
    border-radius: 10px; padding: 14px 16px; font-size: 13px; line-height: 1.6;
    color: var(--text-secondary); margin: 16px 0;
  }
  .manual-box b { color: var(--text-primary); }
  .manual-box-dica { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.25); border-left: 3px solid var(--bar); }
  .manual-box-final { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25); border-left: 3px solid var(--good); margin-top: 28px; }
  .ex-num { font-family: var(--font-mono); font-weight: 700; color: var(--bar); }
  .nc-foto-link {
    display: inline-flex; align-items: center; gap: 4px; margin-top: 10px;
    font-size: 12px; font-weight: 600; text-decoration: none;
    color: var(--bar); background: rgba(59,130,246,0.10);
    border: 1px solid rgba(59,130,246,0.25); padding: 4px 10px; border-radius: 6px;
  }
  .nc-foto-link:hover { background: rgba(59,130,246,0.18); }

  /* KPI Cards */
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 24px;
  }
  .kpi { 
    background: var(--bg-card); 
    border: 1px solid var(--border-color); 
    border-radius: 12px; 
    padding: 16px 20px; 
    box-shadow: var(--card-shadow);
    transition: transform 0.2s ease, border-color 0.2s ease;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
  .kpi::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 3px;
    background: transparent;
  }
  .kpi:hover {
    transform: translateY(-2px);
    border-color: var(--border-color-hover);
  }
  .kpi.kpi-total::before { background: var(--bar); }
  .kpi.kpi-insp::before { background: var(--good); }
  .kpi.kpi-open::before { background: var(--warn); }
  .kpi.kpi-venc::before { background: var(--crit); }
  .kpi.kpi-concl::before { background: #8b5cf6; }

  .kpi .v { 
    font-size: 28px; 
    font-weight: 800; 
    line-height: 1;
    margin-bottom: 6px;
    font-family: var(--font-mono);
  }
  .kpi .l { 
    color: var(--text-secondary); 
    font-size: 12px; 
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Layout Structure */
  .layout-main {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 20px;
    margin-bottom: 24px;
  }
  @media (max-width: 1100px) {
    .layout-main {
      grid-template-columns: 1fr;
    }
  }

  /* Cards styling */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    padding: 20px;
    box-shadow: var(--card-shadow);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  /* Interactive Tactical Map */
  .painel-mapa {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
  }
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .panel-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .panel-title-wrap h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }
  .panel-title-wrap .icon {
    font-size: 18px;
  }
  .map-legend {
    display: flex;
    gap: 14px;
    font-size: 12px;
  }
  .leg-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
  }
  .leg-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .bg-good { background-color: var(--good); }
  .bg-warn { background-color: var(--warn); }
  .bg-crit { background-color: var(--crit); }
  
  .mapa-wrap { 
    position: relative; 
    border-radius: 10px; 
    overflow: hidden; 
    border: 1px solid var(--border-color); 
    background: #05070a;
  }
  .mapa-wrap img { 
    display: block; 
    width: 100%; 
    height: auto; 
    filter: brightness(0.48) saturate(0.7) contrast(1.15);
    transition: filter 0.3s ease;
  }
  body.light-theme .mapa-wrap img {
    filter: brightness(0.95) contrast(1.05) saturate(0.85);
  }
  .mapa-wrap svg { 
    position: absolute; 
    inset: 0; 
    width: 100%; 
    height: 100%; 
  }
  
  .mapa-poly { 
    fill-opacity: 0.28; 
    stroke-width: 1.5px; 
    vector-effect: non-scaling-stroke; 
    stroke-linejoin: round; 
    cursor: pointer; 
    transition: fill-opacity 0.25s ease, stroke-width 0.25s ease;
  }
  .mapa-poly:hover { 
    fill-opacity: 0.58; 
    stroke-width: 3.5px;
  }
  .mapa-poly.active {
    fill-opacity: 0.65;
    stroke-width: 4px;
    stroke: #ffffff !important;
  }

  /* Pulse Animations for Critical/Warning areas */
  @keyframes pulse-red-neon {
    0% { fill-opacity: 0.22; stroke-opacity: 0.7; }
    50% { fill-opacity: 0.48; stroke-opacity: 1; filter: drop-shadow(0 0 6px var(--crit)); }
    100% { fill-opacity: 0.22; stroke-opacity: 0.7; }
  }
  .poly-pulse-red {
    animation: pulse-red-neon 2s infinite ease-in-out;
  }
  @keyframes pulse-yellow-neon {
    0% { fill-opacity: 0.22; stroke-opacity: 0.7; }
    50% { fill-opacity: 0.42; stroke-opacity: 1; filter: drop-shadow(0 0 5px var(--warn)); }
    100% { fill-opacity: 0.22; stroke-opacity: 0.7; }
  }
  .poly-pulse-yellow {
    animation: pulse-yellow-neon 2.5s infinite ease-in-out;
  }

  .mapa-lbl { 
    position: absolute; 
    transform: translate(-50%, -50%); 
    pointer-events: none;
    background: rgba(8, 12, 24, 0.85); 
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border: 1px solid var(--border-color);
    color: #ffffff; 
    font-size: 11px; 
    font-weight: 700;
    padding: 4px 10px; 
    border-radius: 99px; 
    white-space: nowrap;
    display: flex; 
    align-items: center; 
    gap: 6px; 
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    transition: transform 0.2s ease, opacity 0.2s ease;
  }
  .mapa-lbl .dot { 
    width: 14px; 
    height: 14px; 
    border-radius: 50%; 
    color: #ffffff;
    display: inline-flex; 
    align-items: center; 
    justify-content: center; 
    font-size: 9px; 
    flex: none; 
    font-weight: 800;
  }

  /* Grid of Areas */
  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .areas-grid { 
    display: grid; 
    grid-template-columns: repeat(2, 1fr); 
    gap: 12px; 
  }
  @media (max-width: 580px) {
    .areas-grid { grid-template-columns: 1fr; }
  }
  
  .card-area {
    cursor: pointer;
    border-left: 4px solid var(--border-color);
    transition: all 0.2s ease;
  }
  .card-area:hover {
    transform: translateY(-2px);
    border-color: var(--border-color-hover);
    background: var(--bg-surface-hover);
  }
  .card-area.st-verde { border-left-color: var(--good); }
  .card-area.st-amarelo { border-left-color: var(--warn); }
  .card-area.st-vermelho { border-left-color: var(--crit); }
  .card-area.active {
    background: var(--bg-surface-hover);
    border-color: var(--text-primary) !important;
    box-shadow: 0 0 0 1px var(--text-primary), var(--card-shadow);
  }

  .card-area h3 { 
    margin: 0; 
    font-size: 15px; 
    font-weight: 700;
  }
  .pill { 
    font-size: 11px; 
    font-weight: 700; 
    padding: 3px 8px; 
    border-radius: 99px; 
    white-space: nowrap; 
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pill-verde { background: rgba(16, 185, 129, 0.12); color: var(--good); }
  .pill-amarelo { background: rgba(245, 158, 11, 0.15); color: var(--warn); }
  .pill-vermelho { background: rgba(239, 68, 68, 0.12); color: var(--crit); }
  
  .card-meta { 
    color: var(--text-secondary); 
    font-size: 12px; 
    margin: 8px 0 12px; 
  }
  .card-nums { 
    display: flex; 
    gap: 20px; 
    padding-top: 10px;
    border-top: 1px solid var(--border-color);
  }
  .card-nums > div {
    display: flex;
    flex-direction: column;
  }
  .card-nums .num { 
    font-size: 18px; 
    font-weight: 800; 
    font-family: var(--font-mono);
    line-height: 1.2;
  }
  .card-nums .num-bad { color: var(--crit); }
  .card-nums .lbl { 
    font-size: 10px; 
    color: var(--text-muted); 
    text-transform: uppercase;
    margin-top: 2px;
    letter-spacing: 0.2px;
  }

  /* Right Column charts & rank */
  .sidebar-column {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .bar-row { 
    display: grid; 
    grid-template-columns: 110px 1fr 30px; 
    align-items: center; 
    gap: 12px; 
    margin: 10px 0; 
  }
  .bar-lbl { 
    font-size: 12px; 
    color: var(--text-secondary); 
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-track { 
    background: rgba(255,255,255,0.04); 
    border-radius: 99px; 
    height: 10px; 
    overflow: hidden;
    border: 1px solid var(--border-color);
  }
  body.light-theme .bar-track {
    background: rgba(0,0,0,0.04);
  }
  .bar { 
    background: linear-gradient(90deg, var(--bar), #60a5fa); 
    border-radius: 99px; 
    height: 100%; 
    min-width: 2px; 
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .bar-val { 
    font-size: 12px; 
    font-weight: 700; 
    text-align: right; 
    font-family: var(--font-mono);
  }

  /* Tables styling */
  .table-container {
    width: 100%;
    overflow-x: auto;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: var(--card-shadow);
  }
  table { 
    width: 100%; 
    border-collapse: collapse; 
    background: var(--bg-card); 
    text-align: left;
  }
  th, td { 
    padding: 12px 16px; 
    border-bottom: 1px solid var(--border-color); 
    font-size: 13px; 
  }
  th { 
    color: var(--text-secondary); 
    font-weight: 600; 
    font-size: 11px; 
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: rgba(0, 0, 0, 0.12);
  }
  body.light-theme th {
    background: rgba(0,0,0,0.02);
  }
  td.bold { font-weight: 600; }
  td.tabular { font-family: var(--font-mono); }
  
  tr:last-child td { border-bottom: none; }
  tr:hover td {
    background: var(--bg-surface-hover);
  }
  .linha-venc td { 
    color: var(--crit); 
  }
  .venc-warn {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    background: rgba(239, 68, 68, 0.15);
    color: var(--crit);
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 4px;
  }

  /* Badge Styles */
  .badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }
  .badge-crit { background: rgba(239, 68, 68, 0.15); color: var(--crit); border: 1px solid rgba(239, 68, 68, 0.25); }
  .badge-alt { background: rgba(245, 158, 11, 0.15); color: var(--warn); border: 1px solid rgba(245, 158, 11, 0.25); }
  .badge-med { background: rgba(59, 130, 246, 0.15); color: var(--bar); border: 1px solid rgba(59, 130, 246, 0.25); }
  .badge-low { background: rgba(16, 185, 129, 0.15); color: var(--good); border: 1px solid rgba(16, 185, 129, 0.25); }
  
  .badge-success { background: rgba(16, 185, 129, 0.15); color: var(--good); }
  .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--crit); }
  .badge-warning { background: rgba(245, 158, 11, 0.15); color: var(--warn); }
  .badge-info { background: rgba(59, 130, 246, 0.15); color: var(--bar); }

  .resp-tag {
    font-weight: 500;
    color: var(--text-secondary);
    background: rgba(255,255,255,0.05);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }
  body.light-theme .resp-tag {
    background: rgba(0,0,0,0.04);
  }

  .status-pill {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .equip-code {
    font-family: var(--font-mono);
    font-size: 12px;
    background: rgba(255,255,255,0.03);
    padding: 1px 4px;
    border-radius: 3px;
    color: #e0f2fe;
  }
  body.light-theme .equip-code {
    background: rgba(0,0,0,0.04);
    color: #0369a1;
  }

  /* Filters & Search */
  .filter-bar {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }
  @media (max-width: 768px) {
    .filter-bar {
      grid-template-columns: 1fr;
    }
  }
  .search-wrap {
    position: relative;
  }
  .search-input {
    width: 100%;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 14px 10px 36px;
    color: var(--text-primary);
    font-size: 13px;
    transition: all 0.2s ease;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--bar);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    font-size: 14px;
    pointer-events: none;
  }
  .filter-select {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .filter-select:focus {
    border-color: var(--bar);
  }

  /* Details Drawer */
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .drawer-backdrop.active {
    opacity: 1;
    pointer-events: auto;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: -460px;
    width: 460px;
    height: 100vh;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-color);
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.4);
    z-index: 1000;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
  }
  @media (max-width: 480px) {
    .drawer {
      width: 100%;
      right: -100%;
    }
    .drawer.open {
      transform: translateX(-100%);
    }
  }
  .drawer.open {
    transform: translateX(-460px);
  }
  .drawer-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .drawer-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
  }
  .btn-close {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 20px;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
    transition: color 0.2s ease;
  }
  .btn-close:hover {
    color: var(--text-primary);
  }
  
  .drawer-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);
    background: rgba(0,0,0,0.1);
  }
  .drawer-tab {
    flex: 1;
    text-align: center;
    padding: 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    transition: all 0.2s ease;
  }
  .drawer-tab.active {
    color: var(--bar);
    border-bottom-color: var(--bar);
    background: rgba(255,255,255,0.01);
  }

  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }
  .drawer-pane {
    display: none;
  }
  .drawer-pane.active {
    display: block;
  }

  /* Drawer Details Styling */
  .area-summary-box {
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 20px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .summary-row:last-child {
    margin-bottom: 0;
  }
  .summary-row .label {
    color: var(--text-secondary);
  }
  .summary-row .value {
    font-weight: 600;
  }

  .nc-drawer-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 12px;
    border-left: 4px solid var(--border-color);
    position: relative;
    transition: border-color 0.2s ease;
  }
  .nc-drawer-card.risco-critica { border-left-color: var(--crit); }
  .nc-drawer-card.risco-alto { border-left-color: var(--warn); }
  .nc-drawer-card.risco-medio { border-left-color: var(--bar); }
  .nc-drawer-card.risco-baixo { border-left-color: var(--good); }

  .nc-card-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 8px;
  }
  .nc-card-equip {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 600;
  }
  .nc-card-desc {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    margin-bottom: 12px;
  }
  .nc-card-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 8px;
    color: var(--text-secondary);
  }
  .nc-card-meta > div span {
    font-weight: 600;
    color: var(--text-primary);
  }

  .nc-card-obs {
    margin-top: 10px;
    padding: 8px;
    background: rgba(0,0,0,0.15);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    border-left: 2px solid var(--border-color);
  }

  /* Timeline */
  .timeline {
    position: relative;
    padding-left: 20px;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 5px;
    bottom: 5px;
    width: 2px;
    background: var(--border-color);
  }
  .timeline-item {
    position: relative;
    margin-bottom: 20px;
  }
  .timeline-item::before {
    content: '';
    position: absolute;
    left: -20px;
    top: 5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bg-surface);
    border: 2px solid var(--bar);
  }
  .timeline-item.type-NC::before { border-color: var(--crit); }
  .timeline-item.type-Rotina::before { border-color: var(--good); }
  .timeline-item.type-Acompanhamento::before { border-color: var(--warn); }

  .timeline-time {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
  }
  .timeline-title {
    font-size: 13px;
    font-weight: 600;
    margin: 2px 0 4px;
  }
  .timeline-desc {
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* Custom HTML Tooltip */
  .custom-tooltip {
    background: rgba(11, 15, 26, 0.95);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid var(--border-color);
    color: #ffffff;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    pointer-events: none;
    position: absolute;
    z-index: 10000;
    display: none;
    line-height: 1.4;
    transition: opacity 0.15s ease;
  }
  .tooltip-title {
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tooltip-row {
    margin-bottom: 4px;
    color: var(--text-secondary);
  }
  .tooltip-row:last-child {
    margin-bottom: 0;
  }
  .tooltip-row span {
    font-weight: 600;
    color: #ffffff;
  }

  /* Painel de cobrança (NCs x manutenção x compras) */
  .cobranca-grid { display: grid; grid-template-columns: 1fr 0.7fr 1.5fr; gap: 14px; margin-top: 10px; }
  @media (max-width: 1200px) { .cobranca-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 800px) { .cobranca-grid { grid-template-columns: 1fr; } }
  .cobranca-sub { font-size: 12px; font-weight: 700; margin: 0 0 8px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
  .fluxo-alerta {
    margin-top: 8px;
    padding: 8px 10px;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-left: 3px solid var(--bar);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .fluxo-alerta b { color: var(--text-primary); }
  .equip-chip {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 6px;
    white-space: nowrap;
  }

  .equip-row:hover td { background: var(--bg-surface-hover); }
  .equip-destaque {
    outline: 2px solid var(--bar);
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.25);
    transition: outline 0.3s ease, box-shadow 0.3s ease;
  }

  /* Footer styling */
  .rodape { 
    color: var(--text-muted); 
    font-size: 12px; 
    margin-top: 32px;
    text-align: center;
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
  }

  @media print {
    body { padding: 0; background: #fff; color: #000; }
    .card, .kpi, table { break-inside: avoid; }
    .filter-bar, .btn-theme, .drawer-backdrop, .drawer { display: none !important; }
  }
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-brand">
    <span class="mine-icon">⛏️</span> ${esc(EMPRESA.nome)}
    <span class="topbar-tag">Segurança do Trabalho</span>
  </div>
  <div class="topbar-people">
    <span class="cargo"><span class="cargo-icon">👷</span> Gerente: <b>${esc(EMPRESA.gerente)}</b></span>
    <span class="cargo"><span class="cargo-icon">🦺</span> Engenheira: <b>${esc(EMPRESA.engenheira)}</b></span>
  </div>
</div>
<header>
  <div class="title-area">
    <h1>Controle de Inspeções — Áreas da Mina</h1>
    <p class="sub">Relatório executivo gerado em ${fmtData(hoje)} · Janela operacional de ${JANELA_DIAS} dias</p>
  </div>
  <div class="header-actions">
    <button id="themeToggle" class="btn-theme">
      <span class="icon">🌓</span> Tema Claro / Escuro
    </button>
  </div>
</header>

${(LINKS_FORMS.inspecaoEmbed || LINKS_FORMS.tratativaEmbed) ? `
<nav class="abas-topo">
  <button class="aba-btn active" data-view="view-painel">📊 Painel</button>
  ${LINKS_FORMS.inspecaoEmbed ? `<button class="aba-btn" data-view="view-inspecao">📝 Nova Inspeção</button>` : ""}
  ${LINKS_FORMS.tratativaEmbed ? `<button class="aba-btn" data-view="view-tratativa">🔧 Tratar NC</button>` : ""}
  <button class="aba-btn" data-view="view-ajuda">❓ Como usar</button>
</nav>` : `
<nav class="abas-topo">
  <button class="aba-btn active" data-view="view-painel">📊 Painel</button>
  <button class="aba-btn" data-view="view-ajuda">❓ Como usar</button>
</nav>`}

<div id="view-painel" class="view active">
<div class="kpis">
  <div class="kpi kpi-total" id="kpi-saude">
    <div class="v">${emDia}/${AREAS.length}</div>
    <div class="l">Sectores em Dia</div>
  </div>
  <div class="kpi kpi-insp" id="kpi-insp-total">
    <div class="v">${inspJanela.length}</div>
    <div class="l">Inspeções (15d)</div>
  </div>
  <div class="kpi kpi-open" id="kpi-nc-abertas">
    <div class="v">${abertas.length}</div>
    <div class="l">NCs Abertas</div>
  </div>
  <div class="kpi kpi-venc" id="kpi-nc-vencidas">
    <div class="v" style="color:${vencidas.length ? "var(--crit)" : "inherit"}">${vencidas.length}</div>
    <div class="l">NCs Vencidas</div>
  </div>
  <div class="kpi kpi-concl" id="kpi-nc-resolvidas">
    <div class="v">${encerradas.length}</div>
    <div class="l">Resolvidas (Histórico)</div>
  </div>
  <div class="kpi kpi-total">
    <div class="v">${leadGlobal != null ? leadGlobal + " d" : "—"}</div>
    <div class="l">Lead Time Médio de Resolução${resolvidasComPrazo ? ` · ${Math.round((resolvidasNoPrazo / resolvidasComPrazo) * 100)}% no prazo` : ""}</div>
  </div>
</div>

<div class="layout-main">
  <!-- Left Side: Map & Cards -->
  <div class="main-column">
    ${mapaHtml}
    
    <h2 class="section-title"><span>📂</span> Status dos Sectores (Clique para detalhes)</h2>
    <div class="areas-grid">${cards}</div>
  </div>

  <!-- Right Side: Analytics Charts -->
  <div class="sidebar-column">
    <div class="card">
      <h2 class="section-title"><span>📊</span> NCs por Sector (Total Histórico)</h2>
      <div style="margin-top: 10px;">${barras}</div>
    </div>
    
    <div class="card">
      <h2 class="section-title"><span>🏆</span> Ranking de Inspeções por Técnico</h2>
      <p style="color:var(--text-muted);font-size:11px;margin:2px 0 0;">Clique num técnico para ver todas as NCs dele e onde o fluxo está parado.</p>
      <div style="margin-top: 10px;" class="table-container">
        <table>
          <thead>
            <tr><th>Técnico</th><th>Visitas</th><th>NCs Lançadas</th><th>Resolvidas</th><th>Lead Time Médio</th></tr>
          </thead>
          <tbody>
            ${linhasTec || '<tr><td colspan="5">Sem registros de atividade</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${radarEquip}
  </div>
</div>

${gargalosHtml}

<div class="card" style="margin-top: 10px;">
  <h2 class="section-title"><span>📋</span> Histórico de Não Conformidades Abertas (${abertas.length})</h2>
  
  <!-- Advanced Filtering Bar -->
  <div class="filter-bar">
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="search-input" class="search-input" placeholder="Buscar por nº da NC (ex.: NC-0042), descrição, técnico, equipamento...">
    </div>
    <select id="filter-risk" class="filter-select">
      <option value="">Todos os Riscos</option>
      <option value="Crítica">Crítica</option>
      <option value="Alto">Alto</option>
      <option value="Médio">Médio</option>
      <option value="Baixo">Baixo</option>
    </select>
    <select id="filter-resp" class="filter-select">
      <option value="">Todos os Responsáveis</option>
    </select>
    <select id="filter-status-table" class="filter-select">
      <option value="">Todos os Status</option>
      <option value="Aberta">Aberta</option>
      <option value="Em andamento">Em andamento</option>
    </select>
  </div>

  <div class="table-container">
    <table id="table-ncs">
      <thead>
        <tr>
          <th>Nº</th>
          <th>Sector</th>
          <th>Descrição da Ocorrência</th>
          <th>Equipamento</th>
          <th>Risco</th>
          <th>Responsável</th>
          <th>Prazo</th>
          <th>Status</th>
          <th>Lançamento</th>
          <th>Técnico</th>
        </tr>
      </thead>
      <tbody>
        ${linhasNC || '<tr><td colspan="10" style="text-align:center;padding:24px;">Nenhuma Não Conformidade aberta no momento 🎉</td></tr>'}
      </tbody>
    </table>
  </div>
</div>

<p class="rodape">
  Mina de Ferro - Gerenciamento de Não Conformidades & Segurança Operacional.<br>
  Legenda do Mapa: ✓ Em Dia (Inspecionada e sem pendências) · ! Com Pendências Abertas (dentro do prazo) · ✕ Alerta Máximo (Sem inspeção na janela ou com NC vencida).
</p>
</div><!-- /view-painel -->

${LINKS_FORMS.inspecaoEmbed ? `
<div id="view-inspecao" class="view">
  <div class="card form-card">
    <div class="form-head">
      <h2 class="section-title" style="margin:0"><span>📝</span> Registrar Inspeção / Não Conformidade</h2>
      <a class="btn-theme btn-form" href="${esc(LINKS_FORMS.inspecao)}" target="_blank" rel="noopener">Abrir em nova janela ↗</a>
    </div>
    <p class="form-dica">Preencha e envie. O dashboard se atualiza sozinho em poucos minutos — não precisa fazer mais nada.</p>
    <iframe class="form-frame" src="${esc(LINKS_FORMS.inspecaoEmbed)}" loading="lazy" title="Formulário de Inspeção">Carregando…</iframe>
  </div>
</div>` : ""}

${LINKS_FORMS.tratativaEmbed ? `
<div id="view-tratativa" class="view">
  <div class="card form-card">
    <div class="form-head">
      <h2 class="section-title" style="margin:0"><span>🔧</span> Tratar uma NC (mudar status)</h2>
      <a class="btn-theme btn-form" href="${esc(LINKS_FORMS.tratativa)}" target="_blank" rel="noopener">Abrir em nova janela ↗</a>
    </div>
    <p class="form-dica">Informe o número da NC (ex.: NC-0042 — aparece na tabela do painel), o novo status e a evidência.</p>
    <iframe class="form-frame" src="${esc(LINKS_FORMS.tratativaEmbed)}" loading="lazy" title="Formulário de Tratativa">Carregando…</iframe>
  </div>
</div>` : ""}

<div id="view-ajuda" class="view">
  <div class="manual">
    <h2 class="manual-titulo">❓ Como usar este sistema</h2>
    <p class="manual-intro">
      Este painel controla <b>a frequência das inspeções de segurança</b> em cada área da mina e
      <b>o andamento das não conformidades (NC)</b> encontradas. Ele se alimenta sozinho do que os
      técnicos preenchem no formulário — ninguém precisa digitar nada em planilha.
    </p>

    <div class="manual-box manual-box-dica">
      <b>Em 1 minuto:</b> o técnico vai à área → preenche a aba <b>📝 Nova Inspeção</b> →
      se achou problema, descreve; se não achou, responde "Não" (isso comprova a visita) →
      o painel se atualiza sozinho em até 30 minutos.
    </div>

    <h3 class="manual-h3">1. Para os técnicos — o dia a dia</h3>
    <div class="manual-grid">
      <div class="manual-card">
        <h4>📝 Aba "Nova Inspeção"</h4>
        <p>É o formulário que substitui o caderno e o sistema antigo. Funciona no celular.
        Preencha <b>toda vez que for a uma área</b>, mesmo que esteja tudo certo.</p>
        <ul>
          <li><b>Data, hora, responsáveis e local</b> — identificam a visita.</li>
          <li><b>"Houve não conformidade?"</b> → <b>Não</b>: o formulário termina ali e a visita fica
          registrada. <b>Sim</b>: abre os campos do problema.</li>
          <li><b>Descrição</b> — escreva o que viu, onde exatamente e, se souber, a
          <b>TAG do equipamento</b> (ex.: TC-01, BP-04). A TAG liga a NC ao equipamento e às compras.</li>
          <li><b>Risco e gravidade</b> — o quanto é perigoso e o que poderia acontecer.</li>
          <li><b>Responsável pela tratativa e prazo</b> — quem corrige e até quando.</li>
          <li><b>Viu 3 problemas na mesma visita?</b> No fim, responda "Sim" em
          "Registrar OUTRA não conformidade" e preencha a NC 2 e a NC 3. Tudo fica ligado à mesma inspeção.</li>
        </ul>
      </div>
      <div class="manual-card">
        <h4>🔧 Aba "Tratar NC"</h4>
        <p>Serve para <b>mudar o status</b> de uma NC que já existe — sem criar outra.</p>
        <ul>
          <li>Informe o <b>número da NC</b> (ex.: <span class="ex-num">NC-0042</span>). Ele aparece na
          primeira coluna da tabela do painel.</li>
          <li>Escolha o novo status: <b>Em andamento</b> (já está sendo resolvido) ou
          <b>Concluído</b> (resolvido e verificado).</li>
          <li>Escreva na <b>observação</b> o que foi feito — isso vira a evidência da tratativa.</li>
        </ul>
        <p class="manual-aviso">Nunca abra uma NC nova para dizer que a antiga foi resolvida — use esta aba.</p>
      </div>
    </div>

    <h3 class="manual-h3">2. As cores — o que cada uma quer dizer</h3>
    <p class="manual-p">Valem para o mapa e para os cartões de área. A regra usa a janela de
    <b>${JANELA_DIAS} dias</b> (tempo máximo que uma área pode ficar sem receber visita).</p>
    <table class="manual-tabela">
      <tr>
        <td><span class="pill pill-verde"><b>✓</b> Em dia</span></td>
        <td>Área <b>inspecionada</b> dentro dos últimos ${JANELA_DIAS} dias e <b>sem NC aberta</b>. Está tudo certo.</td>
      </tr>
      <tr>
        <td><span class="pill pill-amarelo"><b>!</b> Pendências abertas</span></td>
        <td>Foi inspecionada, mas <b>existe NC aberta ainda dentro do prazo</b>. Atenção, sem urgência.</td>
      </tr>
      <tr>
        <td><span class="pill pill-vermelho"><b>✕</b> Sem inspeção / NC vencida</span></td>
        <td><b>Alerta.</b> Ou a área está há mais de ${JANELA_DIAS} dias sem visita, ou tem NC com
        <b>prazo estourado</b>. Exige ação imediata.</td>
      </tr>
    </table>

    <h3 class="manual-h3">3. Os números do topo (KPIs)</h3>
    <div class="manual-grid">
      <div class="manual-card"><h4>Sectores em dia</h4><p>Quantas áreas estão verdes, do total.
      É o "termômetro" geral da operação: <b>7/17 significa que 10 áreas precisam de atenção</b>.</p></div>
      <div class="manual-card"><h4>Inspeções (${JANELA_DIAS}d)</h4><p>Quantas visitas foram registradas
      na janela atual. Mede se a equipe está indo a campo na frequência combinada.</p></div>
      <div class="manual-card"><h4>NCs abertas</h4><p>Problemas encontrados que <b>ainda não foram
      resolvidos</b> (status Aberta ou Em andamento).</p></div>
      <div class="manual-card"><h4>NCs vencidas</h4><p>Das abertas, quantas <b>passaram do prazo</b>
      de correção. Este é o número mais crítico do painel — é o que a gestão cobra primeiro.</p></div>
      <div class="manual-card"><h4>Resolvidas (histórico)</h4><p>Total já encerrado desde o começo.
      Mostra o trabalho entregue pela equipe.</p></div>
      <div class="manual-card"><h4>Lead time médio de resolução</h4><p>Quantos dias, em média, uma NC
      leva <b>do apontamento até o encerramento</b>, e o <b>% resolvido dentro do prazo</b>.
      Quanto menor o tempo e maior o percentual, melhor.</p></div>
    </div>

    <h3 class="manual-h3">4. Os blocos do painel</h3>
    <div class="manual-grid">
      <div class="manual-card"><h4>🛰️ Mapa da mina</h4><p>Foto de satélite com as áreas pintadas
      na cor do status. <b>Passe o mouse</b> para ver o resumo e <b>clique</b> para abrir o detalhe
      da área. Áreas com contorno tracejado têm posição aproximada.</p></div>
      <div class="manual-card"><h4>📂 Status dos sectores</h4><p>Um cartão por área com:
      <b>última inspeção</b> (e há quantos dias), <b>NC abertas</b>, <b>vencidas</b> e
      <b>total de visitas</b>. Clicar abre o painel lateral com tudo daquela área.</p></div>
      <div class="manual-card"><h4>📊 NCs por sector</h4><p>Quantas NCs cada área já gerou no
      histórico. Serve para achar as áreas que <b>mais repetem problema</b> — candidatas a uma
      ação de fundo, não só remendo.</p></div>
      <div class="manual-card"><h4>🏆 Ranking por técnico</h4><p>Visitas, NCs lançadas, resolvidas e
      lead time de cada técnico. <b>Clique no nome</b> para ver todas as NCs dele e onde cada uma
      está parada. Muitas visitas e poucas NCs pode indicar inspeção superficial.</p></div>
      <div class="manual-card"><h4>⚙️ Radar de equipamentos</h4><p>Vem da base de manutenção.
      Mostra por equipamento: <b>NCs abertas</b>, <b>peças em atenção</b> (desgastadas/meia-vida) e
      <b>compras em andamento</b>. <b>Clique</b> para acender a área no mapa e ver o detalhe.</p></div>
      <div class="manual-card"><h4>🚦 Painel de cobrança</h4><p>Para a gestão cobrar quem trava o
      processo. Mostra <b>NCs abertas por equipe responsável</b> (com as vencidas e a mais antiga),
      <b>com qual analista as compras estão paradas</b> e as <b>solicitações mais antigas</b>.</p></div>
      <div class="manual-card"><h4>📋 Histórico de NCs abertas</h4><p>A lista completa do que está
      pendente, com número, área, risco, responsável e prazo. Use a <b>busca</b> (aceita o número da NC)
      e os filtros de risco, responsável e status.</p></div>
    </div>

    <h3 class="manual-h3">5. O painel lateral (ao clicar numa área)</h3>
    <p class="manual-p">Abre uma janela na direita com quatro abas:</p>
    <ul class="manual-lista">
      <li><b>Não Conformidades</b> — todas da área, pendentes primeiro. Cada cartão mostra o número,
      equipamento, risco, responsável, prazo, quem apontou e — quando existe — o
      <b>alerta azul de compras</b>: o que a manutenção já pediu, com quem está e há quantos dias.
      Se não houver pedido, aparece um <b>aviso âmbar</b> dizendo que o fluxo nem começou.</li>
      <li><b>Histórico de Visitas</b> — a trilha de todas as inspeções, acompanhamentos e desvios
      daquela área, com data, hora e técnico. É a prova de que a área foi visitada.</li>
      <li><b>Equipamentos</b> — o que existe naquela área segundo a base de manutenção, com peças
      em atenção e compras em aberto.</li>
      <li><b>Fluxo</b> — as solicitações de compra em aberto do setor, da mais parada para a mais recente.</li>
    </ul>

    <h3 class="manual-h3">6. Perguntas frequentes</h3>
    <div class="manual-grid">
      <div class="manual-card"><h4>Fui na área e estava tudo certo. Preciso registrar?</h4>
      <p><b>Sim, é essencial.</b> Sem o registro, o sistema entende que ninguém foi lá e a área
      fica vermelha por falta de inspeção. Responda "Não" em "Houve não conformidade" — leva 30 segundos.</p></div>
      <div class="manual-card"><h4>Preenchi o formulário e não apareceu no painel</h4>
      <p>O painel atualiza sozinho a cada <b>30 minutos</b>. Espere e atualize a página
      (no celular, puxe a tela para baixo).</p></div>
      <div class="manual-card"><h4>Errei um dado no formulário</h4>
      <p>Não dá para editar o envio. Registre a correção usando a aba <b>Tratar NC</b>
      (com o número da NC) e escreva na observação o que estava errado.</p></div>
      <div class="manual-card"><h4>Por que a área está vermelha se não tem NC?</h4>
      <p>Porque está há mais de ${JANELA_DIAS} dias sem nenhuma inspeção registrada. Vermelho aqui
      significa "não sabemos como está" — que é um risco tão grande quanto um problema conhecido.</p></div>
      <div class="manual-card"><h4>Quem resolve a NC?</h4>
      <p>A equipe indicada em "Responsável pela tratativa" (manutenção, elétrica, civil...).
      A segurança <b>aponta e cobra</b>; quem executa é a área responsável.</p></div>
      <div class="manual-card"><h4>Posso ver isso no celular?</h4>
      <p>Sim. É o mesmo link, funciona em qualquer celular ou computador, sem instalar nada.
      Salve nos favoritos.</p></div>
    </div>

    <div class="manual-box manual-box-final">
      <b>Regra de ouro:</b> o que não é registrado não existe para a auditoria. Registrar a visita
      (mesmo sem problema) é o que protege a equipe de segurança e mantém o histórico da mina.
    </div>
  </div>
</div>

<!-- Slide-out Details Drawer -->
<div class="drawer-backdrop" id="drawerBackdrop"></div>
<div class="drawer" id="areaDrawer">
  <div class="drawer-header">
    <h2 id="drawerTitle">Nome da Área</h2>
    <button class="btn-close" id="drawerClose">&times;</button>
  </div>
  
  <div class="drawer-tabs">
    <div class="drawer-tab active" data-pane="pane-ncs">Não Conformidades</div>
    <div class="drawer-tab" data-pane="pane-history">Histórico de Visitas</div>
    <div class="drawer-tab" data-pane="pane-equip">Equipamentos</div>
    <div class="drawer-tab" data-pane="pane-fluxo">Fluxo</div>
  </div>
  
  <div class="drawer-content">
    <!-- Pane: Non-Conformities -->
    <div class="drawer-pane active" id="pane-ncs">
      <div class="area-summary-box">
        <div class="summary-row">
          <span class="label" id="lbl-last-insp">Última Inspeção:</span>
          <span class="value" id="summary-last-insp">-</span>
        </div>
        <div class="summary-row">
          <span class="label" id="lbl-status">Status do Sector:</span>
          <span class="value" id="summary-status">-</span>
        </div>
        <div class="summary-row">
          <span class="label">Pendências Abertas:</span>
          <span class="value" id="summary-open-count">-</span>
        </div>
      </div>
      
      <div id="drawer-nc-list">
        <!-- Dynamic Cards -->
      </div>
    </div>
    
    <!-- Pane: Visit Log -->
    <div class="drawer-pane" id="pane-history">
      <div class="timeline" id="drawer-timeline">
        <!-- Dynamic Timeline Items -->
      </div>
    </div>

    <!-- Pane: Equipamentos (base de manutenção) -->
    <div class="drawer-pane" id="pane-equip">
      <div id="drawer-equip-list">
        <!-- Dynamic Equipment Cards -->
      </div>
    </div>

    <!-- Pane: Fluxo de solicitações de compra/manutenção -->
    <div class="drawer-pane" id="pane-fluxo">
      <div id="drawer-fluxo-list">
        <!-- Dynamic Flow Cards -->
      </div>
    </div>
  </div>
</div>

<!-- Custom Tooltip -->
<div class="custom-tooltip" id="mapTooltip"></div>

<script>
  // Injetando dados do servidor
  window.DADOS_NCS = ${JSON.stringify(ncs)};
  window.DADOS_INSPECOES = ${JSON.stringify(inspecoes)};
  window.DADOS_AREAS = ${JSON.stringify(areas)};
  window.DADOS_EQUIPAMENTOS = ${JSON.stringify(equipamentos || [])};
  window.DADOS_FLUXO = ${JSON.stringify(fluxoAbertas)};
  window.JANELA_DIAS = ${JANELA_DIAS};

  // Helper date parsing e comparacao no client
  function parseDateBR(s) {
    if (!s) return null;
    const parts = s.split('/');
    if (parts.length < 2) return null;
    const dia = parseInt(parts[0], 10);
    const mes = parseInt(parts[1], 10) - 1;
    const ano = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
    const d = new Date(ano, mes, dia);
    return isNaN(d) ? null : d;
  }

  function diasDesde(d) {
    if (!d) return Infinity;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    return Math.round((hoje - dd) / 86400000);
  }

  function formatarData(dataStrOrObj) {
    if (!dataStrOrObj) return "nunca";
    if (typeof dataStrOrObj === "string" && dataStrOrObj.includes("T")) {
      // data ISO vinda do JSON (ex.: 2026-07-13T03:00:00.000Z)
      const d = new Date(dataStrOrObj);
      if (!isNaN(d)) return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    }
    if (typeof dataStrOrObj === "string") return dataStrOrObj;
    const d = new Date(dataStrOrObj);
    if (isNaN(d)) return String(dataStrOrObj);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  // Elementos do DOM
  const themeToggle = document.getElementById('themeToggle');
  const drawer = document.getElementById('areaDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const drawerClose = document.getElementById('drawerClose');
  const drawerTitle = document.getElementById('drawerTitle');
  
  const paneNcs = document.getElementById('pane-ncs');
  const paneHistory = document.getElementById('pane-history');
  
  const summaryLastInsp = document.getElementById('summary-last-insp');
  const summaryStatus = document.getElementById('summary-status');
  const summaryOpenCount = document.getElementById('summary-open-count');
  const drawerNcList = document.getElementById('drawer-nc-list');
  const drawerTimeline = document.getElementById('drawer-timeline');
  
  const mapTooltip = document.getElementById('mapTooltip');

  // Abas do topo (Painel / Nova Inspeção / Tratar NC)
  document.querySelectorAll('.aba-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const alvo = btn.getAttribute('data-view');
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === alvo));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Inicializacao do Tema
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
  }
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
  });

  // Populacao dinamica de responsaveis no filtro
  const selectResp = document.getElementById('filter-resp');
  const todosResponsaveis = [...new Set(window.DADOS_NCS.map(n => n.responsavel).filter(Boolean))].sort();
  todosResponsaveis.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    selectResp.appendChild(opt);
  });

  // Eventos de Busca e Filtro da Tabela
  const searchInput = document.getElementById('search-input');
  const filterRisk = document.getElementById('filter-risk');
  const filterResp = document.getElementById('filter-resp');
  const filterStatusTable = document.getElementById('filter-status-table');

  function filtrarTabela() {
    const query = searchInput.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const riscoAlvo = filterRisk.value;
    const respAlvo = filterResp.value;
    const statusAlvo = filterStatusTable.value;

    const rows = document.querySelectorAll('#table-ncs tbody tr');
    let totalVisiveis = 0;

    rows.forEach(row => {
      // Se for a linha de "Nenhuma NC aberta", ignora
      if (row.cells.length === 1) return;

      const area = row.getAttribute('data-area-name') || '';
      const risco = row.getAttribute('data-risco') || '';
      const resp = row.getAttribute('data-resp') || '';
      const contentText = row.textContent.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

      const matchesSearch = contentText.includes(query);
      const matchesRisco = !riscoAlvo || risco === riscoAlvo;
      const matchesResp = !respAlvo || resp === respAlvo;
      
      // Checa status
      let matchesStatus = true;
      if (statusAlvo) {
        const rowStatusText = row.cells[7].textContent.trim();
        matchesStatus = rowStatusText.toLowerCase().includes(statusAlvo.toLowerCase());
      }

      if (matchesSearch && matchesRisco && matchesResp && matchesStatus) {
        row.style.display = '';
        totalVisiveis++;
      } else {
        row.style.display = 'none';
      }
    });
  }

  searchInput.addEventListener('input', filtrarTabela);
  filterRisk.addEventListener('change', filtrarTabela);
  filterResp.addEventListener('change', filtrarTabela);
  filterStatusTable.addEventListener('change', filtrarTabela);

  // Selecao de Area e Drawer
  let areaAtiva = null;

  // constroi o cartao de uma NC (usado na visao por area e na visao por tecnico)
  // opcoes: { mostrarArea: true } troca "Técnico" por "Área" no rodapé;
  //         { avisoSemFluxo: true } avisa quando NC aberta não tem SC na manutenção
  function construirCardNC(nc, opcoes) {
    opcoes = opcoes || {};
    const ehFechada = nc.status.toLowerCase().includes('encerrada') || nc.status.toLowerCase().includes('conclu');
    const prazoDate = parseDateBR(nc.prazo);
    let prazoBadge = '';

    if (ehFechada) {
      prazoBadge = '<span class="badge badge-success">Encerrada</span>';
    } else if (prazoDate) {
      const atraso = diasDesde(prazoDate);
      if (atraso > 0) {
        prazoBadge = '<span class="badge badge-danger">Vencida há ' + atraso + 'd</span>';
      } else if (atraso === 0) {
        prazoBadge = '<span class="badge badge-warning">Vence Hoje</span>';
      } else {
        prazoBadge = '<span class="badge badge-info">Vence em ' + Math.abs(atraso) + 'd</span>';
      }
    } else if (nc.prazo) {
      prazoBadge = '<span class="badge badge-info">' + nc.prazo + '</span>';
    } else {
      prazoBadge = '<span class="badge badge-low">Sem Prazo</span>';
    }

    const riscoNorm = (nc.risco || '').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let cardRiscoClass = 'risco-medio';
    if (riscoNorm.startsWith('crit')) cardRiscoClass = 'risco-critica';
    else if (riscoNorm.startsWith('alt')) cardRiscoClass = 'risco-alto';
    else if (riscoNorm.startsWith('baix')) cardRiscoClass = 'risco-baixo';

    const div = document.createElement('div');
    div.className = 'nc-drawer-card ' + cardRiscoClass;
    if (ehFechada) div.style.opacity = '0.65';

    // chips dos equipamentos da base de manutenção citados na NC
    const chips = (nc.equipTags || []).map(t => '<span class="equip-chip">' + t + '</span>').join('');

    // alertas do fluxo de compras ligados a esta NC
    let alertasFluxo = '';
    if (nc.fluxo && nc.fluxo.length && !ehFechada) {
      alertasFluxo = nc.fluxo.map(f =>
        '<div class="fluxo-alerta">🛒 <b>Solicitação em aberto na manutenção:</b> ' + f.texto.slice(0, 70) +
        (f.tag ? ' <span class="equip-chip">' + f.tag + '</span>' : '') +
        '<br>Solicitante: <b>' + (f.solicitante || '—') + '</b> · Está com: <b>' + (f.analista || 'sem analista') + '</b>' +
        (f.leadTime != null ? ' · Aguardando: <b>' + f.leadTime + ' d</b>' : '') +
        (f.data ? ' · Aberta em ' + f.data : '') +
        '</div>').join('');
    } else if (opcoes.avisoSemFluxo && !ehFechada) {
      alertasFluxo = '<div class="fluxo-alerta" style="border-left-color:var(--warn);background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.25);">' +
        '⚠ <b>Sem solicitação de compra localizada na manutenção</b> — o fluxo ainda não começou; cobrar abertura de SC do responsável (' + (nc.responsavel || 'não definido') + ').</div>';
    }

    const quartoCampo = opcoes.mostrarArea
      ? '<div>Área: <span>' + (nc.area || '-') + '</span></div>'
      : '<div>Técnico: <span>' + (nc.tecnico || '-') + '</span></div>';

    div.innerHTML =
      '<div class="nc-card-header">' +
        '<span class="nc-card-equip"><b style="color:var(--bar)">' + (nc.numero || '') + '</b> · ' +
          (nc.equipamento ? '⚙️ ' + nc.equipamento : 'Equipamento não especificado') + chips + '</span>' +
        prazoBadge +
      '</div>' +
      '<div class="nc-card-desc">' + nc.descricao + '</div>' +
      '<div class="nc-card-meta">' +
        '<div>Resp: <span>' + (nc.responsavel || '-') + '</span></div>' +
        '<div>Risco: <span>' + (nc.risco || 'Médio') + '</span></div>' +
        quartoCampo +
        '<div>Registrado: <span>' + (nc.dataRegistro || '-') + '</span></div>' +
        (nc.inspecao ? '<div>Inspeção: <span>' + nc.inspecao + '</span></div>' : '') +
        '<div>Status: <span>' + (nc.status || '-') + '</span></div>' +
      '</div>' +
      (nc.foto ? '<a class="nc-foto-link" href="' + nc.foto + '" target="_blank" rel="noopener">📷 Ver foto</a>' : '') +
      (nc.obs ? '<div class="nc-card-obs"><b>Nota:</b> ' + nc.obs + '</div>' : '') +
      alertasFluxo;
    return div;
  }

  // mostra/esconde as abas que só fazem sentido na visão por área
  function mostrarAbasDeArea(mostrar) {
    ['pane-equip', 'pane-fluxo'].forEach(pane => {
      const tab = document.querySelector('.drawer-tab[data-pane="' + pane + '"]');
      if (tab) tab.style.display = mostrar ? '' : 'none';
    });
  }

  function selecionarArea(nomeArea) {
    if (!nomeArea) return;
    areaAtiva = nomeArea;
    mostrarAbasDeArea(true);
    document.getElementById('lbl-last-insp').textContent = 'Última Inspeção:';
    document.getElementById('lbl-status').textContent = 'Status do Sector:';
    
    // Atualiza estado visual no mapa e nos cards
    document.querySelectorAll('.mapa-poly').forEach(p => {
      if (p.getAttribute('data-area') === nomeArea) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });

    document.querySelectorAll('.card-area').forEach(c => {
      if (c.getAttribute('data-area') === nomeArea) {
        c.classList.add('active');
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        c.classList.remove('active');
      }
    });

    // Pega dados da area
    const dadosArea = window.DADOS_AREAS.find(a => a.area === nomeArea);
    const ncsArea = window.DADOS_NCS.filter(n => n.area === nomeArea);
    const inspArea = window.DADOS_INSPECOES.filter(i => i.area === nomeArea);

    if (!dadosArea) return;

    // Preenche cabeçalho e KPI
    drawerTitle.textContent = nomeArea;
    
    const dataUltimaStr = dadosArea.ultima ? formatarData(dadosArea.ultima) : 'Nunca inspecionada';
    summaryLastInsp.textContent = dadosArea.ultima ? (dataUltimaStr + (dadosArea.dias > 0 ? " (há " + dadosArea.dias + " dias)" : " (hoje)")) : 'Nunca';
    
    let statusClass = 'pill-verde';
    if (dadosArea.status === 'vermelho') statusClass = 'pill-vermelho';
    else if (dadosArea.status === 'amarelo') statusClass = 'pill-amarelo';
    
    summaryStatus.innerHTML = '<span class="pill ' + statusClass + '">' + dadosArea.rotulo + '</span>';
    
    const abertasArea = ncsArea.filter(n => {
      const st = n.status.toLowerCase();
      return !st.includes('encerr') && !st.includes('fech') && !st.includes('concl') && !st.includes('resolv');
    });
    summaryOpenCount.textContent = abertasArea.length;

    // Preenche aba NCs
    drawerNcList.innerHTML = '';
    if (ncsArea.length === 0) {
      drawerNcList.innerHTML = '<div style="text-align:center;padding:40px 10px;color:var(--text-secondary);font-size:13px;">Nenhuma não conformidade registrada neste sector. 🎉</div>';
    } else {
      // Ordena por status (abertas primeiro, depois por prazo)
      const ncsOrdenadas = [...ncsArea].sort((a, b) => {
        const aFechada = a.status.toLowerCase().includes('encerrada') || a.status.toLowerCase().includes('conclu');
        const bFechada = b.status.toLowerCase().includes('encerrada') || b.status.toLowerCase().includes('conclu');
        if (aFechada !== bFechada) return aFechada ? 1 : -1;
        
        const pA = parseDateBR(a.prazo) || Infinity;
        const pB = parseDateBR(b.prazo) || Infinity;
        return pA - pB;
      });

      ncsOrdenadas.forEach(nc => drawerNcList.appendChild(construirCardNC(nc)));
    }

    // Preenche aba Timeline de Inspecoes
    drawerTimeline.innerHTML = '';
    if (inspArea.length === 0) {
      drawerTimeline.innerHTML = '<div style="text-align:center;padding:40px 10px;color:var(--text-secondary);font-size:13px;">Sem visitas registradas.</div>';
    } else {
      // Ordena decrescente por data
      const inspOrdenadas = [...inspArea].sort((a, b) => {
        const dA = parseDateBR(a.data) || 0;
        const dB = parseDateBR(b.data) || 0;
        return dB - dA;
      });

      inspOrdenadas.forEach(i => {
        const div = document.createElement('div');
        div.className = 'timeline-item type-' + (i.tipo || 'Rotina');
        const tipoLabel = i.tipo === 'NC' ? 'Desvio Lançado' : (i.tipo === 'Acompanhamento' ? 'Acompanhamento' : 'Inspeção de Rotina');
        div.innerHTML =
          '<div class="timeline-time">' + i.data + ' às ' + (i.hora || '00:00') + '</div>' +
          '<div class="timeline-title">' + tipoLabel + '</div>' +
          '<div class="timeline-desc">Realizado pelo técnico <b>' + i.tecnico + '</b></div>';
        drawerTimeline.appendChild(div);
      });
    }

    // Preenche aba Equipamentos (base de manutenção)
    const drawerEquipList = document.getElementById('drawer-equip-list');
    drawerEquipList.innerHTML = '';
    const equipArea = (window.DADOS_EQUIPAMENTOS || []).filter(e => e.area === nomeArea);
    if (equipArea.length === 0) {
      drawerEquipList.innerHTML = '<div style="text-align:center;padding:40px 10px;color:var(--text-secondary);font-size:13px;">Nenhum equipamento cadastrado para este sector na base de manutenção.</div>';
    } else {
      const ordenados = [...equipArea].sort((a, b) =>
        (b.ncsAbertas - a.ncsAbertas) || (b.atencao - a.atencao) || String(a.tag).localeCompare(String(b.tag)));
      ordenados.forEach(e => {
        let borda = 'risco-baixo';
        if (e.ncsAbertas > 0) borda = 'risco-critica';
        else if (e.atencao > 0) borda = 'risco-alto';

        let badges = '';
        if (e.ncsAbertas > 0) badges += '<span class="badge badge-danger">' + e.ncsAbertas + ' NC aberta' + (e.ncsAbertas > 1 ? 's' : '') + '</span> ';
        if (e.atencao > 0) badges += '<span class="badge badge-warning">' + e.atencao + ' peça' + (e.atencao > 1 ? 's' : '') + ' em atenção</span> ';
        if (e.fluxoTotal > 0) badges += '<span class="badge badge-info">' + e.fluxoTotal + ' em compra</span> ';
        if (!badges) badges = '<span class="badge badge-success">Sem pendências</span>';

        // NCs apontadas neste equipamento
        let ncsHtml = '';
        if (e.ncsInfo && e.ncsInfo.length) {
          ncsHtml = '<div class="nc-card-obs"><b>NCs deste equipamento:</b>' +
            e.ncsInfo.map(n => '<br>• ' + n.descricao.slice(0, 65) +
              ' <i>(' + n.status + (n.tecnico ? ' · ' + n.tecnico : '') + ')</i>').join('') + '</div>';
        }

        // solicitações de compra em aberto ligadas a este equipamento
        let fluxoHtml = '';
        if (e.fluxoItems && e.fluxoItems.length) {
          fluxoHtml = e.fluxoItems.map(f =>
            '<div class="fluxo-alerta">🛒 ' + f.texto.slice(0, 65) +
            '<br>Está com: <b>' + (f.analista || 'sem analista') + '</b>' +
            (f.leadTime != null ? ' · Aguardando: <b>' + f.leadTime + ' d</b>' : '') +
            (f.data ? ' · Aberta em ' + f.data : '') + '</div>').join('');
        }

        const div = document.createElement('div');
        div.className = 'nc-drawer-card ' + borda;
        div.setAttribute('data-tag', e.tag);
        div.innerHTML =
          '<div class="nc-card-header">' +
            '<span class="nc-card-equip">⚙️ ' + e.tag + '</span>' +
            '<span>' + badges + '</span>' +
          '</div>' +
          '<div class="nc-card-desc">' + (e.modelo || e.nome || '') + '</div>' +
          '<div class="nc-card-meta">' +
            '<div>Componentes mapeados: <span>' + e.componentes + '</span></div>' +
            '<div>NCs no histórico: <span>' + e.ncsTotal + '</span></div>' +
          '</div>' +
          ncsHtml + fluxoHtml;
        drawerEquipList.appendChild(div);
      });
    }

    // Preenche aba Fluxo (solicitações de compra/manutenção em aberto do sector)
    const drawerFluxoList = document.getElementById('drawer-fluxo-list');
    drawerFluxoList.innerHTML = '';
    const fluxoArea = (window.DADOS_FLUXO || []).filter(s => s.setor === nomeArea);
    if (fluxoArea.length === 0) {
      drawerFluxoList.innerHTML = '<div style="text-align:center;padding:40px 10px;color:var(--text-secondary);font-size:13px;">Nenhuma solicitação de compra em aberto para este sector nas planilhas de acompanhamento.<br><br><span style="font-size:11px;">(As planilhas da base cobrem Britagem, Concentração e Elétrica.)</span></div>';
    } else {
      const LIMITE = 40;
      const ordenadas = [...fluxoArea].sort((a, b) => (b.leadTime || 0) - (a.leadTime || 0));
      ordenadas.slice(0, LIMITE).forEach(s => {
        const div = document.createElement('div');
        const lead = s.leadTime || 0;
        div.className = 'nc-drawer-card ' + (lead > 60 ? 'risco-critica' : lead > 30 ? 'risco-alto' : 'risco-medio');
        div.innerHTML =
          '<div class="nc-card-header">' +
            '<span class="nc-card-equip">🛒 ' + (s.tag || 'sem TAG') + '</span>' +
            '<span class="badge ' + (lead > 60 ? 'badge-danger' : lead > 30 ? 'badge-warning' : 'badge-info') + '">' +
              (s.leadTime != null ? 'aguardando ' + s.leadTime + ' d' : 'sem prazo') + '</span>' +
          '</div>' +
          '<div class="nc-card-desc">' + (s.texto || '(sem descrição)') + '</div>' +
          '<div class="nc-card-meta">' +
            '<div>Solicitante: <span>' + (s.solicitante || '—') + '</span></div>' +
            '<div>Está com: <span>' + (s.analista || 'sem analista') + '</span></div>' +
            '<div>Aberta em: <span>' + (s.data || '—') + '</span></div>' +
            '<div>SC/OC: <span>' + (s.ordem && /^[A-Za-z]{1,3}[\\s-]?\\d/.test(s.ordem) ? s.ordem : (s.oc || '—')) + '</span></div>' +
          '</div>';
        drawerFluxoList.appendChild(div);
      });
      if (ordenadas.length > LIMITE) {
        const aviso = document.createElement('div');
        aviso.style.cssText = 'text-align:center;padding:12px;color:var(--text-muted);font-size:12px;';
        aviso.textContent = '... e mais ' + (ordenadas.length - LIMITE) + ' solicitações (veja o painel Fluxo de Compras no dashboard).';
        drawerFluxoList.appendChild(aviso);
      }
    }

    // Abre o painel lateral
    drawer.classList.add('open');
    drawerBackdrop.classList.add('active');
  }

  function fecharDrawer() {
    drawer.classList.remove('open');
    drawerBackdrop.classList.remove('active');
    
    // Limpa selecoes visuais
    document.querySelectorAll('.mapa-poly').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.card-area').forEach(c => c.classList.remove('active'));
    areaAtiva = null;
  }

  drawerClose.addEventListener('click', fecharDrawer);
  drawerBackdrop.addEventListener('click', fecharDrawer);

  // Clique num equipamento do Radar: acende a área no mapa e abre o painel
  // já na aba Equipamentos, com o card do equipamento destacado
  function selecionarEquipamento(tag) {
    const e = (window.DADOS_EQUIPAMENTOS || []).find(x => x.tag === tag);
    if (!e || !e.area) return;
    selecionarArea(e.area);
    document.querySelector('.drawer-tab[data-pane="pane-equip"]').click();
    setTimeout(() => {
      const card = document.querySelector('#drawer-equip-list .nc-drawer-card[data-tag="' + CSS.escape(tag) + '"]');
      if (card) {
        card.classList.add('equip-destaque');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => card.classList.remove('equip-destaque'), 2600);
      }
    }, 150);
  }

  document.querySelectorAll('.equip-row').forEach(row => {
    row.addEventListener('click', () => selecionarEquipamento(row.getAttribute('data-tag')));
  });

  // Clique num técnico do Ranking: abre o painel com TODAS as NCs dele;
  // nas pendentes mostra o fluxo de compras (ou avisa que nem existe SC aberta)
  function selecionarTecnico(nome) {
    if (!nome) return;
    areaAtiva = null;
    document.querySelectorAll('.mapa-poly').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.card-area').forEach(c => c.classList.remove('active'));
    mostrarAbasDeArea(false);
    document.querySelector('.drawer-tab[data-pane="pane-ncs"]').click();
    document.getElementById('lbl-last-insp').textContent = 'Última Visita:';
    document.getElementById('lbl-status').textContent = 'Situação do Técnico:';

    const ncsTec = window.DADOS_NCS.filter(n => n.tecnico === nome);
    const inspTec = window.DADOS_INSPECOES.filter(i => i.tecnico === nome);

    drawerTitle.textContent = '👷 ' + nome;

    // resumo do técnico
    const datas = inspTec.map(i => parseDateBR(i.data)).filter(Boolean).sort((a, b) => b - a);
    summaryLastInsp.textContent = datas.length
      ? formatarData(datas[0]) + ' · ' + inspTec.length + ' visitas no total'
      : 'Nenhuma visita registrada';

    const abertasTec = ncsTec.filter(n => {
      const st = n.status.toLowerCase();
      return !st.includes('encerr') && !st.includes('fech') && !st.includes('concl') && !st.includes('resolv');
    });
    const vencidasTec = abertasTec.filter(n => {
      const p = parseDateBR(n.prazo);
      return p && diasDesde(p) > 0;
    });
    let pill = '<span class="pill pill-verde">Tudo encerrado</span>';
    if (vencidasTec.length) pill = '<span class="pill pill-vermelho">' + vencidasTec.length + ' NC vencida' + (vencidasTec.length > 1 ? 's' : '') + '</span>';
    else if (abertasTec.length) pill = '<span class="pill pill-amarelo">' + abertasTec.length + ' em aberto</span>';
    const resolvidasTec = ncsTec.length - abertasTec.length;
    const leadsTec = ncsTec.map(n => {
      const m = String(n.status).match(/encerrada em (\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})/i);
      if (!m) return null;
      const d1 = parseDateBR(n.dataRegistro), d2 = parseDateBR(m[1]);
      return (d1 && d2 && d2 >= d1) ? Math.round((d2 - d1) / 86400000) : null;
    }).filter(v => v != null);
    const leadTec = leadsTec.length ? Math.round(leadsTec.reduce((a, b) => a + b, 0) / leadsTec.length) : null;
    summaryStatus.innerHTML = pill + ' <span style="color:var(--text-secondary);font-size:12px;">(' + ncsTec.length + ' lançadas · ' + resolvidasTec + ' resolvidas' + (leadTec != null ? ' · lead médio ' + leadTec + ' d' : '') + ')</span>';
    summaryOpenCount.textContent = abertasTec.length;

    // NCs do técnico: abertas primeiro, depois por prazo
    drawerNcList.innerHTML = '';
    if (ncsTec.length === 0) {
      drawerNcList.innerHTML = '<div style="text-align:center;padding:40px 10px;color:var(--text-secondary);font-size:13px;">' + nome + ' ainda não lançou nenhuma não conformidade.</div>';
    } else {
      const ordenadas = [...ncsTec].sort((a, b) => {
        const aF = a.status.toLowerCase().includes('encerr') || a.status.toLowerCase().includes('conclu');
        const bF = b.status.toLowerCase().includes('encerr') || b.status.toLowerCase().includes('conclu');
        if (aF !== bF) return aF ? 1 : -1;
        return (parseDateBR(a.prazo) || Infinity) - (parseDateBR(b.prazo) || Infinity);
      });
      ordenadas.forEach(nc => drawerNcList.appendChild(construirCardNC(nc, { mostrarArea: true, avisoSemFluxo: true })));
    }

    // histórico de visitas do técnico (com a área)
    drawerTimeline.innerHTML = '';
    if (inspTec.length === 0) {
      drawerTimeline.innerHTML = '<div style="text-align:center;padding:40px 10px;color:var(--text-secondary);font-size:13px;">Sem visitas registradas.</div>';
    } else {
      [...inspTec].sort((a, b) => (parseDateBR(b.data) || 0) - (parseDateBR(a.data) || 0)).forEach(i => {
        const div = document.createElement('div');
        div.className = 'timeline-item type-' + (i.tipo || 'Rotina');
        const tipoLabel = i.tipo === 'NC' ? 'Desvio Lançado' : (i.tipo === 'Acompanhamento' ? 'Acompanhamento' : 'Inspeção de Rotina');
        div.innerHTML =
          '<div class="timeline-time">' + i.data + ' às ' + (i.hora || '00:00') + '</div>' +
          '<div class="timeline-title">' + tipoLabel + '</div>' +
          '<div class="timeline-desc">Área: <b>' + i.area + '</b></div>';
        drawerTimeline.appendChild(div);
      });
    }

    drawer.classList.add('open');
    drawerBackdrop.classList.add('active');
  }

  document.querySelectorAll('.tec-row').forEach(row => {
    row.addEventListener('click', () => selecionarTecnico(row.getAttribute('data-tec')));
  });

  // Eventos nos Polígonos do Mapa e nos Cards
  document.querySelectorAll('.mapa-poly').forEach(poly => {
    const area = poly.getAttribute('data-area');
    poly.addEventListener('click', () => selecionarArea(area));
    
    poly.addEventListener('mouseenter', (e) => {
      const dadosArea = window.DADOS_AREAS.find(a => a.area === area);
      if (!dadosArea) return;
      
      const corStatus = dadosArea.status === 'verde' ? '#10b981' : (dadosArea.status === 'amarelo' ? '#f59e0b' : '#ef4444');
      
      const ultimaVisita = dadosArea.ultima ? formatarData(dadosArea.ultima) : 'nunca';
      const corAbertas = dadosArea.abertas.length ? '#f59e0b' : '#fff';
      mapTooltip.innerHTML =
        '<div class="tooltip-title">' +
          '<span class="tooltip-status" style="background:' + corStatus + '"></span>' +
          area +
        '</div>' +
        '<div class="tooltip-row">Status: <span style="color:' + corStatus + '">' + dadosArea.rotulo + '</span></div>' +
        '<div class="tooltip-row">Última Visita: <span>' + ultimaVisita + '</span></div>' +
        '<div class="tooltip-row">NC Abertas: <span style="color:' + corAbertas + '">' + dadosArea.abertas.length + '</span></div>';
      mapTooltip.style.display = 'block';

    });

    poly.addEventListener('mousemove', (e) => {
      mapTooltip.style.left = (e.pageX + 15) + 'px';
      mapTooltip.style.top = (e.pageY + 15) + 'px';
    });

    poly.addEventListener('mouseleave', () => {
      mapTooltip.style.display = 'none';
    });
  });

  document.querySelectorAll('.card-area').forEach(card => {
    const area = card.getAttribute('data-area');
    card.addEventListener('click', () => selecionarArea(area));
    
    // Efeito cascata para destacar poligono correspondente ao passar mouse no card
    card.addEventListener('mouseenter', () => {
      document.querySelectorAll('.mapa-poly').forEach(p => {
        if (p.getAttribute('data-area') === area) p.style.fillOpacity = '0.6';
      });
    });
    card.addEventListener('mouseleave', () => {
      document.querySelectorAll('.mapa-poly').forEach(p => {
        if (p.getAttribute('data-area') === area && p !== areaAtiva) p.style.fillOpacity = '';
      });
    });
  });

  // Alternancia de abas no Drawer
  document.querySelectorAll('.drawer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const paneId = tab.getAttribute('data-pane');
      document.querySelectorAll('.drawer-pane').forEach(p => p.classList.remove('active'));
      document.getElementById(paneId).classList.add('active');
    });
  });

  // Filtro ao clicar nos KPIs
  document.getElementById('kpi-nc-abertas').addEventListener('click', () => {
    filterStatusTable.value = 'Aberta';
    filterRisk.value = '';
    filterResp.value = '';
    searchInput.value = '';
    filtrarTabela();
    document.getElementById('table-ncs').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('kpi-nc-vencidas').addEventListener('click', () => {
    // Para vencidas, mostramos apenas as linhas que possuem o aviso "vencida"
    filterStatusTable.value = 'Aberta';
    filterRisk.value = '';
    filterResp.value = '';
    searchInput.value = 'vencida';
    filtrarTabela();
    document.getElementById('table-ncs').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('kpi-saude').addEventListener('click', () => {
    // Reseta filtros
    filterStatusTable.value = '';
    filterRisk.value = '';
    filterResp.value = '';
    searchInput.value = '';
    filtrarTabela();
  });
</script>
</body>
</html>`;

  fs.writeFileSync(ARQ_DASH, html, "utf8");
}


// ---------------------------------------------------------------- main
function main() {
  fs.mkdirSync(DIR_EXPORTS, { recursive: true });
  fs.mkdirSync(DIR_DATA, { recursive: true });

  const arquivos = fs.readdirSync(DIR_EXPORTS).filter((f) => f.toLowerCase().endsWith(".txt"));
  let msgs = [];
  for (const f of arquivos) {
    const m = parseChat(fs.readFileSync(path.join(DIR_EXPORTS, f), "utf8"));
    console.log(`  ${f}: ${m.length} mensagens`);
    msgs = msgs.concat(m);
  }
  if (!arquivos.length) console.log("  (nenhum .txt em exports/ — gerando dashboard só com os dados já salvos)");

  const { ncs, inspecoes, acompanhamentos } = processar(msgs);
  const rNC = mergeNCs(ncs);
  const rInsp = mergeInspecoes(inspecoes);
  numerarRegistros(rNC.todas, rInsp.todas);
  const nAcomp = aplicarAcompanhamentos(rNC.todas, acompanhamentos);
  gravarNCs(rNC.todas);
  gravarInspecoes(rInsp.todas);
  const areas = calcularAreas(rNC.todas, rInsp.todas);

  // cadastro de equipamentos vindo da base de manutenção (gerado pelo extrai-equipamentos.py)
  let equipamentos = [];
  const arqEquip = path.join(DIR, "equipamentos.json");
  if (fs.existsSync(arqEquip)) {
    try {
      equipamentos = cruzarEquipamentosComNCs(JSON.parse(fs.readFileSync(arqEquip, "utf8")), rNC.todas);
      console.log(`  equipamentos.json: ${equipamentos.length} equipamentos carregados`);
    } catch (e) {
      console.log(`  aviso: equipamentos.json inválido (${e.message})`);
    }
  }

  // fluxo de solicitações de manutenção/compras (gerado pelo extrai-solicitacoes.py)
  let fluxoAbertas = [];
  const arqFluxo = path.join(DIR, "solicitacoes.json");
  if (fs.existsSync(arqFluxo)) {
    try {
      const solicitacoes = JSON.parse(fs.readFileSync(arqFluxo, "utf8"));
      fluxoAbertas = cruzarFluxoComNCs(rNC.todas, solicitacoes);
      if (equipamentos.length) ligarFluxoAEquipamentos(equipamentos, fluxoAbertas);
      console.log(`  solicitacoes.json: ${solicitacoes.length} solicitações (${fluxoAbertas.length} em aberto)`);
    } catch (e) {
      console.log(`  aviso: solicitacoes.json inválido (${e.message})`);
    }
  }

  gerarDashboard(areas, rNC.todas, rInsp.todas, equipamentos, fluxoAbertas);

  console.log(`\nNCs novas: ${rNC.adicionadas} (total ${rNC.todas.length}) · Acompanhamentos aplicados: ${nAcomp} · Inspeções novas: ${rInsp.adicionadas} (total ${rInsp.todas.length})`);
  for (const a of areas) console.log(`  ${a.status === "verde" ? "🟢" : a.status === "amarelo" ? "🟡" : "🔴"} ${a.area} — ${a.rotulo}`);
  console.log(`\nPlanilha: ${ARQ_NC}\nDashboard: ${ARQ_DASH}`);
}

main();
