# EXECUTAR TUDO EM ORDEM — Codex/Cowork no Mac do Dr.
# Cole este arquivo INTEIRO no Codex/Cowork quando voltar (20:11 ou agora).
# Codex executa em SÉRIE (uma por vez) pra não sobrecarregar o Mac.

## REGRA ABSOLUTA

1. Executar UMA tarefa por vez (NUNCA paralelo)
2. Antes de cada tarefa: Telegram pro Dr. "iniciando T-X"
3. Depois de cada tarefa: Telegram "T-X concluida" OU "T-X FALHOU porque ..."
4. Se uma tarefa falhar: parar TUDO e relatar
5. Todas IAs usam Ollama local gemma3:4b (R$0). NUNCA chamar OpenAI/Anthropic/Gemini paga sem autorização expressa do Dr.
6. Aguardar 30s entre tarefas (CPU descansar)
7. Se Mac ficar quente (>85°C) ou bateria <20%: parar e avisar

## CONTATOS

- Telegram bot: `8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ`
- Chat Dr.: `8713631351`
- Repo Git: `clinica-hairtech/nodejs` branch `claude/hairtech-whatsapp-ai-liD5V`

---

## ORDEM DAS TAREFAS

### T-1: Vigia Mac (5min — leve)

Verifica se Mac está saudável (Ollama up, HD livre, processos).

```bash
curl -sL https://raw.githubusercontent.com/clinica-hairtech/nodejs/claude/hairtech-whatsapp-ai-liD5V/codex-briefings/20260522-instalar-vigia-mac.md \
  -o /tmp/vigia-brief.md
# Le e executa os passos do briefing
```

Resultado esperado: launchd job `org.hairtech.vigia` rodando, primeiro Telegram heartbeat chegou.

---

### T-2: Triagem 984 cobranças via Ollama local (50min — CPU pesado)

```bash
# Garante Ollama rodando
pgrep -f Ollama || open -a Ollama
sleep 5

# Baixa script
mkdir -p ~/Documents/HairTech_temp
cd ~/Documents/HairTech_temp
curl -sL https://raw.githubusercontent.com/clinica-hairtech/nodejs/claude/hairtech-whatsapp-ai-liD5V/codex-scripts/triagem-2-cobrancas-ollama.py \
  -o triagem.py

# Verifica que CSV existe em algum lugar
find ~/Documents ~/Downloads ~/Desktop -name "MENSAGENS_APPLE_COBRANCAS_HIGIENIZADO_2026-05-22.csv" 2>/dev/null | head -3

# Roda
python3 triagem.py
```

Resultado: 4 CSVs (`triagem2_cobranca_real.csv`, `triagem2_spam_golpe.csv`, etc) + relatório MD + Telegram com resumo.

**Se CSV não encontrado**: Telegram "T-2 BLOQUEIO: CSV de cobranças não encontrado no Mac. Dr. precisa apontar caminho."

---

### T-3: Vasculhar fotos no Mac (procurar prints de telefone, fotos pacientes) (30min)

```bash
mkdir -p ~/Documents/HairTech_temp
cd ~/Documents/HairTech_temp

# Inventário de TODAS imagens do Mac (fora Library/System)
find ~/Documents ~/Desktop ~/Downloads ~/Pictures -type f \
  \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.heic" -o -iname "*.webp" \) \
  -not -path "*/Library/*" -not -path "*/.Trash/*" 2>/dev/null > todas-imagens.txt

TOTAL=$(wc -l < todas-imagens.txt)
echo "Total imagens encontradas: $TOTAL"

# Classifica via Ollama gemma3:4b (categorias: FOTO_CABELO / COMPROVANTE / PRINT_TELEFONE / DOCUMENTO / OUTRO)
# Roda ~3s por imagem. Pra 5000 imagens = ~4h. CORTAR EM LOTES de 200/rodada.

# Pra primeira rodada, fazer só 200 mais recentes
head -200 todas-imagens.txt > lote-1.txt

while IFS= read -r f; do
  base64=$(base64 -i "$f" 2>/dev/null | head -c 1500000)  # max 1.5MB
  [ -z "$base64" ] && continue
  mime=$(file -b --mime-type "$f")
  resp=$(curl -s http://localhost:11434/api/generate \
    -d "{\"model\":\"gemma3:4b\",\"prompt\":\"Classifique esta imagem. UMA palavra: FOTO_CABELO ou COMPROVANTE ou PRINT_TELEFONE ou DOCUMENTO ou OUTRO\",\"images\":[\"$base64\"],\"stream\":false}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("response","OUTRO").strip().split()[0])')
  echo "$resp|$f" >> classificacao-imagens.txt
  sleep 0.5
done < lote-1.txt

# Resumo
echo "=== RESUMO ===" >> ~/HairTech_org_log.txt
for cat in FOTO_CABELO COMPROVANTE PRINT_TELEFONE DOCUMENTO OUTRO; do
  count=$(grep -c "^${cat}|" classificacao-imagens.txt)
  echo "${cat}: ${count}" >> ~/HairTech_org_log.txt
done

# Telegram resumo
curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
  -d "chat_id=8713631351" \
  --data-urlencode "text=T-3 lote 1 concluido. ${TOTAL} imagens total no Mac. Primeiros 200 classificados. Ver ~/Documents/HairTech_temp/classificacao-imagens.txt"
```

**Se quiser continuar próximos lotes**: rodar mesmo loop com `sed -n '201,400p' todas-imagens.txt > lote-2.txt` etc.

---

### T-4: Aguardar Dr. APROVAR estrutura de organização HD

NÃO executar T-5 (organizar Mac) sem o Dr. confirmar a estrutura.

```bash
# Verifica se Dr. aprovou
APROVADO=$(curl -s "https://api.github.com/repos/clinica-hairtech/nodejs/contents/data/HD_APROVADO.flag?ref=claude/hairtech-whatsapp-ai-liD5V" 2>/dev/null | grep -c "name")
if [ "$APROVADO" = "0" ]; then
  curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
    -d "chat_id=8713631351" \
    --data-urlencode "text=T-4 AGUARDANDO: Dr. precisa ler PROPOSTA_ORGANIZACAO_HD.md no GitHub e aprovar. Pra aprovar, crie arquivo HD_APROVADO.flag no repo OU responde SIM nesse chat."
  exit 0
fi
```

**Dr. aprova respondendo SIM no chat com Codex/Cowork — ou criando flag.**

---

### T-5: Organizar HD Mac (estrutura humana + dedup) (~80min)

SÓ executar se T-4 deu APROVADO.

Briefing completo: `codex-briefings/20260521-0145-organizar-mac.md` (já no repo)

Passos resumidos:
1. Inventário READ-ONLY (sem mexer)
2. Detectar duplicatas REAIS por shasum
3. Telegram Dr. com resumo "vou mover X arquivos, deletar Y duplicatas"
4. AGUARDAR SIM no Telegram (timeout 30min, senão para)
5. Criar estrutura `~/Documentos/HairTech/{01-PACIENTES,...,99-A-REVISAR}`
6. `mv` (nunca cp) com verificação shasum origem==destino
7. Duplicatas pra Trash (recuperável)
8. Classificação Ollama pro 99-A-REVISAR
9. Catalogar tudo em `~/Documentos/HairTech/_CATÁLOGO.md` + `_INDEX.json`
10. Telegram resumo final

---

### T-6: Instalar OpenClaw Mac (30min)

Briefing: `codex-briefings/20260521-0200-openclaw-mac.md`

OpenClaw local roda agentes adicionais sem custo. Útil pra processamento em background.

---

### T-7: Auto-aprovar dialogs Mac (5min)

Briefing: `codex-briefings/20260521-0145-auto-aprovar-dialogs.md`

Evita que dialogs do Mac travem Codex em background.

---

### T-8: Webhook server Mac (15min — Cloudflare Tunnel)

Parte do briefing `20260521-0145-organizar-mac.md` (seção "TAREFA SECUNDÁRIA").

Permite que Claude Code Web (eu) **eventualmente** mande comandos seguros pro Mac (lista de allowlist) sem precisar de Codex. Cloudflare Tunnel é grátis.

URL fica anotada em `~/.hairtech-webhook/tunnel.log` e enviada via Telegram.

---

### T-9: Exportar histórico ChatGPT via Chrome (20min)

```bash
# AppleScript abre Chrome cacheado do Dr.
osascript -e 'tell application "Google Chrome" to open location "https://chatgpt.com/#settings/DataControls"'
sleep 5
# Aguardar Dr. clicar manualmente em "Export Data" OU automatizar via UI scripting
# Após receber email da OpenAI (24-48h), baixar ZIP e salvar em ~/Documents/HairTech/07-SISTEMA-HAIRTECH/chatgpt-export/
```

Telegram avisa Dr. pra clicar.

---

### T-10: Processar fila OpenClaw via Ollama Mac (60min)

Em vez de esperar OpenClaw VPS, processa as 10 tarefas da fila localmente (gemma3:4b é mais rápido que qwen no VPS pra coisa simples).

```bash
# Baixa fila
curl -sL https://raw.githubusercontent.com/clinica-hairtech/nodejs/claude/hairtech-whatsapp-ai-liD5V/data/openclaw-fila/tarefas-22052026.json \
  -o /tmp/fila.json

# Para cada tarefa em pendentes[], executa via Ollama local
python3 -c "
import json, subprocess, requests
fila = json.load(open('/tmp/fila.json'))
for t in fila['pendentes']:
    print(f\"Executando {t['id']}: {t['descricao'][:80]}\")
    # ... lógica de cada tipo
    # Salva resultado em ~/Documents/HairTech_temp/{id}-resultado.json
    # Envia Telegram resumo
"

# Commita resultados de volta
cd ~/Documents/HairTech_temp
# git clone se primeira vez, senão git pull + git add + git commit + git push
```

---

### T-11: Sincronizar resultado com Drive (15min)

```bash
# Copia tudo de ~/Documents/HairTech_temp/ pra pasta Drive sincronizada
# Se rclone instalado:
rclone copy ~/Documents/HairTech_temp/ gdrive:HairTech/_resultados_codex/ -P

# Telegram avisa
curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
  -d "chat_id=8713631351" \
  --data-urlencode "text=T-11 concluido. Todos resultados das tarefas T1-T10 estao no Drive HairTech/_resultados_codex/"
```

---

## RESUMO TEMPO ESTIMADO

| Tarefa | Tempo | Tipo |
|---|---|---|
| T-1 vigia Mac | 5min | leve |
| T-2 triagem 984 cobranças | 50min | CPU pesado |
| T-3 vasculhar fotos lote 1 | 30min | CPU pesado |
| T-4 aguardar Dr. aprovar HD | até 30min | espera |
| T-5 organizar HD | 80min | mv + ollama |
| T-6 OpenClaw Mac | 30min | install |
| T-7 auto-aprovar dialogs | 5min | leve |
| T-8 webhook Mac | 15min | install |
| T-9 export ChatGPT | 20min | manual + espera |
| T-10 processar fila OpenClaw local | 60min | ollama |
| T-11 sync Drive | 15min | rede |

**Total ativo: ~5h. Total com esperas: ~7h.** Roda em background, Dr. dorme.

## SE FALHAR

Qualquer tarefa que falhar: PARA TUDO, log em `~/HairTech_org_log.txt`, Telegram detalhe pro Dr. Nunca pular pra próxima se uma falhou (pode ser que a próxima dependa).

## SE TUDO DER CERTO

Telegram final: "Codex/Cowork concluiu T-1 a T-11 em Xh. Dr. acordou com Mac organizado, cobranças triadas, fotos classificadas, fila OpenClaw processada, ChatGPT exportado." Toda evidência em Drive.
