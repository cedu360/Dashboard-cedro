# -*- coding: utf-8 -*-
"""
Importa relatórios de auditoria do sistema ON SAFETY (onsafety.com.br) para o
controle de NCs. Lê os PDFs da pasta onsafety/ e gera, para cada um, um .txt
no formato do WhatsApp dentro de exports/ — daí o nc-mina.js processa igual
às mensagens do grupo (sem duplicar o que já entrou).

Uso:  python extrai-onsafety.py
Precisa de: pip install pypdf
"""
import os, re, sys, unicodedata
from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")

DIR = os.path.dirname(os.path.abspath(__file__))
DIR_PDF = os.path.join(DIR, "onsafety")
DIR_EXPORTS = os.path.join(DIR, "exports")

# palavras-chave -> área do dashboard (edite à vontade; sem acento, minúsculo)
AREA_KEYWORDS = [
    (["tambor magnetico", "tm tambor", "flotacao", "concentracao", "planta 3", "gx600",
      "ponte rolante", "hidrociclone", "whc", "espessador", "celula"], "Concentração (Planta 3 + GX600)"),
    (["britagem 1a", "brit 1a"], "Britagem 1A"),
    (["planta 4"], "Planta 4"),
    (["britador", "britagem", "alimentador", "mandibula"], "Britagem 1"),
    (["filtro prensa", "filtragem", "filtro", "torta", "prensa"], "Filtragem"),
    (["lavra", "cava", "frente de lavra"], "Área de Lavra"),
    (["oficina ajpm", "ajpm"], "Oficina AJPM"),
    (["oficina mpc"], "Oficina MPC"),
    (["balanca"], "Balança"),
    (["refeitorio", "restaurante"], "Restaurante"),
    (["vestiario", "banheiro"], "Banheiro/Vestiário Cedro Operacional"),
    (["portaria", "guarita"], "Portaria"),
    (["escritorio", "administrativo"], "Centro Administrativo"),
]

# palavra-chave -> nome do equipamento a registrar na NC (primeiro que casar)
EQUIP_KEYWORDS = [
    ("tambor magnetico", "Tambor magnético (TM)"),
    ("britador", "Britador"),
    ("peneira", "Peneira"),
    ("correia", "Correia transportadora"),
    ("bomba", "Bomba"),
    ("filtro", "Filtro prensa"),
    ("extintor", "Extintor"),
    ("ponte rolante", "Ponte rolante"),
    ("escada", "Escada"),
    ("passarela", "Passarela"),
]

SEVERIDADE = {"1": "Baixa", "2": "Média", "3": "Alta", "4": "Alta", "5": "Crítica"}

def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    return "".join(c for c in s if not unicodedata.combining(c)).lower()

def achar_area(texto):
    n = norm(texto)
    for chaves, area in AREA_KEYWORDS:
        for c in chaves:
            if c in n:
                return area
    return None

def achar_equip(texto):
    n = norm(texto)
    for chave, nome in EQUIP_KEYWORDS:
        if chave in n:
            return nome
    return ""

def limpar(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

def processa_pdf(caminho):
    reader = PdfReader(caminho)
    txt = "\n".join(p.extract_text() or "" for p in reader.pages)

    m = re.search(r"Executado por:\s*([^\n]+)", txt)
    tecnico = limpar(m.group(1)) if m else "ON SAFETY"

    m = re.search(r"Inspeção iniciada em:\s*(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})", txt)
    if not m:
        m = re.search(r"Inspeção iniciada em:\s*(\d{2}/\d{2}/\d{4})", txt)
        data_ini, hora_ini = (m.group(1), "08:00") if m else (None, "08:00")
    else:
        data_ini, hora_ini = m.group(1), m.group(2)
    if not data_ini:
        print(f"  aviso: sem data em {os.path.basename(caminho)} — pulado")
        return None

    linhas_saida = []
    ncs = []

    # ---- Não conformidades: item da NR + "Não Conforme" + Observação
    for m in re.finditer(
        r'(\d{1,2}\.\d{1,2}(?:\.\d{1,3})?(?:\s*"[a-z]")?)\s*-\s*.*?Não Conforme\s*'
        r'Observaç[ãa]o:\s*(.*?)(?=Criado no sistema|$)',
        txt, re.S,
    ):
        # o item mais específico é o último código antes de "Não Conforme"
        # (ex.: cabeçalho 31.12 e depois o item 31.12.21 "b")
        antes = m.group(0).split("Não Conforme")[0]
        codigos = re.findall(r'\d{1,2}\.\d{1,2}(?:\.\d{1,3})?(?:\s*"[a-z]")?', antes)
        item_nr = limpar(codigos[-1] if codigos else m.group(1))
        obs = m.group(2)
        # remove o dígito de severidade que fica sozinho no fim do bloco
        sev = ""
        msev = re.search(r"\n\s*([1-5])\s*$", obs.rstrip())
        if msev:
            sev = SEVERIDADE.get(msev.group(1), "")
            obs = obs[: msev.start()]
        obs = limpar(obs)
        if not obs:
            continue
        area = achar_area(obs)
        equip = achar_equip(obs)
        ncs.append({"obs": obs, "area": area, "equip": equip, "sev": sev, "item": item_nr})

        if not area:
            print(f"  ⚠ NC sem área identificada — edite o txt gerado e preencha a linha 'Área:':")
            print(f"    \"{obs[:80]}\"")

        corpo = [f"{data_ini} {hora_ini} - {tecnico}: #NC"]
        corpo.append(f"Área: {area or '(PREENCHA: Britagem / Britagem 2 / Britagem 3 / Concentração / Filtro Prensa / Área de Vivência)'}")
        if equip:
            corpo.append(f"Equipamento: {equip}")
        corpo.append(f"Não Conformidade: {obs} (ON SAFETY · NR {item_nr})")
        if sev:
            corpo.append(f"Classificação: {sev}")
        linhas_saida.append("\n".join(corpo))

    # ---- Fechamentos (inspeção fotográfica "Conforme")
    for m in re.finditer(
        r"(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}):\d{2}\s*\n\s*\d{2}/\d{2}/\d{4}\s+(.*?)\s+Conforme",
        txt, re.S,
    ):
        data_f, hora_f, texto_f = m.group(1), m.group(2), limpar(m.group(3))
        if not texto_f:
            continue
        # tenta casar com uma NC do mesmo relatório (palavras em comum)
        toks_f = {w for w in re.split(r"[^a-z0-9]+", norm(texto_f)) if len(w) >= 4}
        alvo = None
        melhor = 0
        for nc in ncs:
            toks_n = {w for w in re.split(r"[^a-z0-9]+", norm(nc["obs"])) if len(w) >= 4}
            score = len(toks_f & toks_n)
            if score > melhor:
                melhor, alvo = score, nc
        if alvo and alvo["area"]:
            linhas_saida.append(
                f"{data_f} {hora_f} - {tecnico}: #ACOMPANHAMENTO\n"
                f"Área: {alvo['area']}\nNC: {alvo['obs'][:90]}\nStatus: Concluído\n"
                f"Observação: {texto_f} (evidência ON SAFETY)"
            )
        elif alvo:
            print(f"  ⚠ fechamento \"{texto_f[:60]}\" casa com NC sem área — ajuste o txt")

    if not linhas_saida:
        print(f"  (nenhuma NC/fechamento em {os.path.basename(caminho)})")
        return None
    return "\n".join(linhas_saida) + "\n", len(ncs)

os.makedirs(DIR_PDF, exist_ok=True)
os.makedirs(DIR_EXPORTS, exist_ok=True)
pdfs = [f for f in os.listdir(DIR_PDF) if f.lower().endswith(".pdf")]
if not pdfs:
    print(f"Nenhum PDF em {DIR_PDF} — jogue os relatórios ON SAFETY lá e rode de novo.")
total = 0
for f in pdfs:
    print(f"Lendo: {f}")
    r = processa_pdf(os.path.join(DIR_PDF, f))
    if not r:
        continue
    conteudo, n = r
    slug = re.sub(r"[^A-Za-z0-9]+", "_", os.path.splitext(f)[0]).strip("_").lower()
    saida = os.path.join(DIR_EXPORTS, f"onsafety_{slug}.txt")
    with open(saida, "w", encoding="utf-8") as fp:
        fp.write(conteudo)
    total += n
    print(f"  -> {os.path.basename(saida)} ({n} NC)")
print(f"\nPronto: {total} NC(s) convertida(s). Agora rode o rodar.bat para atualizar o dashboard.")
