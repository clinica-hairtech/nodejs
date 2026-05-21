TAREFA: organizar arquivos do Mac em estrutura HUMANO-FRIENDLY + remover duplicatas SEM deixar duplicar de novo
OBJETIVO: liberar espaco HD, manter tudo localizavel pelo Dr. (nao so agentes), sem perda de arquivo

CONTEXTO: Codex (sessao anterior) copiou arquivos pra organizar mas DUPLICOU em vez de MOVER. HD enchendo.

ESTRUTURA OFICIAL DE ORGANIZACAO (Dr. precisa achar tudo):

~/Documents/HairTech/
├── 01-PACIENTES/
│   ├── ATIVOS/[Nome Sobrenome]/
│   │   ├── fotos-pre/
│   │   ├── fotos-pos/
│   │   ├── contratos/
│   │   ├── anamnese.txt
│   │   ├── comprovantes/
│   │   └── pos-op/
│   ├── INATIVOS/                (>1 ano sem atividade)
│   └── ARQUIVO/                 (encerrados)
├── 02-CLINICA/
│   ├── contratos-fornecedores/
│   ├── notas-fiscais-clinica/
│   ├── alvaras-licencas/
│   └── financeiro-clinica/
├── 03-PROCEDIMENTOS/
│   ├── modelos-contrato/
│   ├── tcle-termos/
│   ├── guias-pos-op/
│   └── protocolos-mmp-fue/
├── 04-MARKETING/
│   ├── fotos-redes-sociais/
│   ├── videos/
│   ├── design/
│   └── posts-prontos/
├── 05-EDUCACAO-MEDICA/
│   ├── cursos-feitos/
│   ├── artigos-pubmed/
│   ├── apresentacoes/
│   └── certificados/
├── 06-SISTEMA-HAIRTECH/
│   ├── backups-banco/
│   ├── credenciais/             (criptografar com 1Password depois)
│   └── memoria-central/         (cópia local da pasta Drive)
└── 99-A-REVISAR/                (arquivos que nao consegui classificar)

REGRAS DE OURO:
1. NUNCA usar cp. Sempre mv. Se precisar comparar, usar shasum.
2. Para cada arquivo movido: verificar shasum antes/depois = identico.
3. Se houver duplicata real (mesmo shasum, nomes diferentes/iguais):
   manter o mais RECENTE por mtime, deletar antigo.
4. NUNCA tocar ~/Library/ (sistema)
5. NUNCA mover de iCloud Drive sem confirmar (sync pode quebrar)
6. Criar log /tmp/organizacao_log.txt com cada movimento
7. Telegram Dr. ANTES de deletar qualquer coisa pesada (>10MB ou >100 arquivos)

EXECUCAO:

PASSO 1 - Inventario (READ-ONLY, sem mexer em nada):
```bash
mkdir -p ~/Documents/HairTech_inventario
cd ~/Documents/HairTech_inventario

# Mapeia tudo que tem nas pastas-fonte
for src in ~/Documents ~/Desktop ~/Downloads ~/Library/Mobile\ Documents/com~apple~CloudDocs; do
  echo "=== $src ==="
  find "$src" -type f -not -path "*/Library/*" -not -name ".DS_Store" \
    -exec ls -la {} \; 2>/dev/null
done > inventario_completo.txt 2>&1

wc -l inventario_completo.txt

# Tamanho total
du -sh ~/Documents ~/Desktop ~/Downloads 2>/dev/null
```

PASSO 2 - Detectar duplicatas REAIS por conteudo (shasum):
```bash
find ~/Documents ~/Desktop ~/Downloads -type f -size +1k \
  -not -path "*/.Trash/*" -not -path "*/Library/*" \
  -print0 2>/dev/null | xargs -0 shasum -a 256 2>/dev/null \
  | sort | uniq -d -w 64 > duplicatas_por_hash.txt

# Mostra grupos de duplicatas
awk '{print $1}' duplicatas_por_hash.txt | sort -u | while read hash; do
  echo "--- HASH $hash ---"
  grep "^$hash " duplicatas_por_hash.txt | cut -d' ' -f3-
done > duplicatas_grupos.txt

wc -l duplicatas_grupos.txt
```

PASSO 3 - Telegram Dr. com resumo:
```bash
TOTAL_DUPS=$(grep -c '^---' duplicatas_grupos.txt)
ESPACO=$(awk '{print $3}' duplicatas_por_hash.txt | xargs ls -la 2>/dev/null | awk '{sum+=$5} END {printf "%.1fGB", sum/1024/1024/1024}')

curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
  -d "chat_id=8713631351" \
  --data-urlencode "text=Manus encontrou $TOTAL_DUPS grupos de duplicatas (mesmo conteudo). Estimativa de espaco recuperavel: $ESPACO. Pronto pra mover originais pra estrutura nova e deletar duplicatas. Responde SIM pra prosseguir."
```

AGUARDAR resposta "SIM" via Telegram (max 30min).

PASSO 4 - Criar estrutura nova:
```bash
mkdir -p ~/Documents/HairTech/{01-PACIENTES/{ATIVOS,INATIVOS,ARQUIVO},02-CLINICA/{contratos-fornecedores,notas-fiscais-clinica,alvaras-licencas,financeiro-clinica},03-PROCEDIMENTOS/{modelos-contrato,tcle-termos,guias-pos-op,protocolos-mmp-fue},04-MARKETING/{fotos-redes-sociais,videos,design,posts-prontos},05-EDUCACAO-MEDICA/{cursos-feitos,artigos-pubmed,apresentacoes,certificados},06-SISTEMA-HAIRTECH/{backups-banco,credenciais,memoria-central},99-A-REVISAR}
```

PASSO 5 - Mover (NAO copiar) com verificacao por shasum:
Helper function:
```bash
mover_seguro() {
  local src="$1"
  local dst="$2"
  if [ ! -f "$src" ]; then return 1; fi

  # Calcula hash antes
  local hash_orig=$(shasum -a 256 "$src" | awk '{print $1}')

  # Move
  mv "$src" "$dst" 2>/dev/null || return 2

  # Verifica hash apos
  local hash_novo=$(shasum -a 256 "$dst" | awk '{print $1}')

  if [ "$hash_orig" = "$hash_novo" ]; then
    echo "OK: $src -> $dst (hash $hash_orig)" >> /tmp/organizacao_log.txt
    return 0
  else
    # Falha! Tenta restaurar
    mv "$dst" "$src" 2>/dev/null
    echo "FAIL: $src -> $dst (hash mudou)" >> /tmp/organizacao_log.txt
    return 3
  fi
}
```

Aplicar classificadores por padroes simples:
```bash
# Contratos
find ~/Documents ~/Desktop ~/Downloads -type f \
  -name "*contrato*" -o -name "*Contrato*" -o -name "*CONTRATO*" 2>/dev/null \
  | while read f; do
    case "$f" in
      *paciente*|*Paciente*|*FUE*) mover_seguro "$f" ~/Documents/HairTech/03-PROCEDIMENTOS/modelos-contrato/ ;;
      *fornecedor*|*Ecologica*|*Health*) mover_seguro "$f" ~/Documents/HairTech/02-CLINICA/contratos-fornecedores/ ;;
      *) mover_seguro "$f" ~/Documents/HairTech/99-A-REVISAR/ ;;
    esac
  done

# Notas fiscais
find ~/Documents ~/Desktop ~/Downloads -type f \
  -name "*NF*.pdf" -o -name "*nota*fiscal*" -o -name "*Fatura*" 2>/dev/null \
  | while read f; do
    mover_seguro "$f" ~/Documents/HairTech/02-CLINICA/notas-fiscais-clinica/
  done

# Fotos de pacientes (heuristica: comeca com IMG_ E esta em pasta HairTech ou paciente)
# CUIDADO: nao mover fotos pessoais
find ~/Documents/HairTech_old ~/Pictures/HairTech 2>/dev/null \
  -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.heic" -o -name "*.png" \) \
  | while read f; do
    mover_seguro "$f" ~/Documents/HairTech/99-A-REVISAR/
  done

# Memoria central / backups sistema
find ~/Documents ~/Desktop ~/Downloads -type f \
  \( -name "MEMORIA_*" -o -name "ARQUIVO_MESTRE*" -o -name "PLANO_*" -o -name "BRIEFING_*" \) 2>/dev/null \
  | while read f; do
    mover_seguro "$f" ~/Documents/HairTech/06-SISTEMA-HAIRTECH/memoria-central/
  done

# Credenciais
find ~/Documents ~/Desktop ~/Downloads -type f \
  -name "*credencial*" -o -name "*senha*" -o -name "*token*" 2>/dev/null \
  | while read f; do
    mover_seguro "$f" ~/Documents/HairTech/06-SISTEMA-HAIRTECH/credenciais/
  done

# Cursos e certificados
find ~/Documents ~/Desktop ~/Downloads -type f \
  \( -name "*Certificado*" -o -name "*Curso*" -o -name "*RAT*" -o -name "*tricologia*" -o -name "*Tricologia*" \) 2>/dev/null \
  | while read f; do
    case "$f" in
      *certificado*|*Certificado*|*CERTIFICADO*) mover_seguro "$f" ~/Documents/HairTech/05-EDUCACAO-MEDICA/certificados/ ;;
      *) mover_seguro "$f" ~/Documents/HairTech/05-EDUCACAO-MEDICA/cursos-feitos/ ;;
    esac
  done
```

PASSO 6 - Deletar duplicatas REAIS (mesmo shasum):
```bash
# Pra cada grupo de duplicatas, manter o que esta na pasta HairTech/ ou o mais recente
awk '{print $1}' duplicatas_por_hash.txt | sort -u | while read hash; do
  # Lista todos com este hash
  ARQUIVOS=$(grep "^$hash " duplicatas_por_hash.txt | cut -d' ' -f3-)

  # Prefere o que esta em ~/Documents/HairTech/ como original
  ORIGINAL=$(echo "$ARQUIVOS" | grep "/HairTech/" | head -1)
  [ -z "$ORIGINAL" ] && ORIGINAL=$(echo "$ARQUIVOS" | head -1)

  # Move os outros pra Trash (recuperavel)
  echo "$ARQUIVOS" | while read f; do
    [ "$f" = "$ORIGINAL" ] && continue
    [ -z "$f" ] && continue
    echo "DEL: $f (mantem $ORIGINAL)" >> /tmp/organizacao_log.txt
    mv "$f" ~/.Trash/ 2>/dev/null
  done
done
```

PASSO 7 - Relatorio final via Telegram:
```bash
MOVIDOS=$(grep -c "^OK:" /tmp/organizacao_log.txt)
DELETADOS=$(grep -c "^DEL:" /tmp/organizacao_log.txt)
FALHAS=$(grep -c "^FAIL:" /tmp/organizacao_log.txt)
ESPACO_LIVRE=$(df -h / | awk 'NR==2{print $4}')

curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
  -d "chat_id=8713631351" \
  --data-urlencode "text=Organizacao concluida!
Movidos pra estrutura: $MOVIDOS
Duplicatas deletadas (na Trash): $DELETADOS
Falhas (precisa rever): $FALHAS
Espaco livre agora: $ESPACO_LIVRE

Tudo em ~/Documents/HairTech/ com 6 categorias numeradas. Confere /tmp/organizacao_log.txt"
```

PASSO 8 - Subir log no Drive:
```bash
# Upload /tmp/organizacao_log.txt pra Drive pasta MEMORIA_CENTRAL
# (Manus tem auth Google ativa)
```

LIMITES:
- NUNCA toca: ~/Library/, /Applications/, /System/
- NUNCA deleta de iCloud sem confirmar
- Pra arquivos >100MB: confirmar individualmente
- Se /tmp/organizacao_log.txt nao gravar: parar imediatamente
- Tudo na Trash, nao deleta direto

RETORNAR PRA CLAUDE CODE WEB:
- Counts: movidos / deletados / falhas
- Estrutura final criada (tree -L 2 ~/Documents/HairTech/)
- GB liberados
- Tempo gasto
- Log salvo no Drive
