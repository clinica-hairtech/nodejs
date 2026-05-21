TAREFA: limpar duplicatas que o Codex (ou outro agente) criou no Mac
OBJETIVO: liberar espaco no HD do Dr. Ricardo sem deletar nada importante

CONTEXTO: Codex tentou organizar arquivos no Mac do Dr. e duplicou ao
inves de mover. Padrao macOS: arquivo.ext + "arquivo 2.ext".
HD estourando.

PRE-VERIFICACAO (rodar antes de qualquer delete):

1) Mapear duplicatas em lugares seguros:
   find ~/Documents ~/Desktop ~/Downloads ~/Library/Mobile\ Documents \
     -type f \( \
       -name "* 2.*" -o -name "* 3.*" -o -name "* 4.*" -o -name "* 5.*" \
       -o -name "* copia.*" -o -name "* copy.*" -o -name "* cópia.*" \
       -o -name "*\ 2" -o -name "*\ copia" -o -name "*\ copy" \
     \) > /tmp/duplicatas_candidatas.txt 2>/dev/null
   wc -l /tmp/duplicatas_candidatas.txt
   du -ch $(cat /tmp/duplicatas_candidatas.txt) 2>/dev/null | tail -1

2) Validar que original existe (so deletar se original presente):
   while IFS= read -r dup; do
     # Tenta reconstruir nome original removendo " 2" antes da extensao
     original=$(echo "$dup" | sed -E 's/ [0-9]+(\.[^.]+)?$/\1/; s/ copia(\.[^.]+)?$/\1/i; s/ copy(\.[^.]+)?$/\1/i')
     if [ -f "$original" ] && [ "$original" != "$dup" ]; then
       echo "SAFE: $dup"
     else
       echo "MANTER: $dup (original nao encontrado)"
     fi
   done < /tmp/duplicatas_candidatas.txt > /tmp/duplicatas_classificadas.txt
   grep -c "^SAFE:" /tmp/duplicatas_classificadas.txt
   grep -c "^MANTER:" /tmp/duplicatas_classificadas.txt

3) MOSTRAR ao Dr. via Telegram antes de deletar:
   curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
     -d "chat_id=8713631351" \
     -d "text=Manus encontrou X duplicatas no Mac (Y GB liberaveis). Vou deletar so as SAFE (original confirmado existe). Confirma com SIM."
   AGUARDAR resposta "SIM" antes de prosseguir.

EXECUCAO (apos Dr. confirmar):

4) Mover SAFE pra lixeira (recuperavel se errar):
   grep "^SAFE:" /tmp/duplicatas_classificadas.txt | sed 's/^SAFE: //' | \
     while IFS= read -r f; do
       trash "$f" 2>/dev/null || mv "$f" ~/.Trash/ 2>/dev/null
     done

5) Verificar espaco liberado:
   df -h /
   du -sh ~/.Trash/

REGRAS:
- NUNCA deletar de ~/Library/ (sistema)
- NUNCA deletar arquivos no iCloud sem confirmar (podem estar em outros devices)
- Sempre usar Trash (recuperavel) na primeira passada
- Se duplicata > 100MB: confirmar caso a caso

EXTRA (se tiver tempo):
- App "dupeGuru" detecta duplicatas por conteudo (mesmo arquivo, nome diferente)
- brew install dupeguru
- Roda em ~/Documents ~/Pictures ~/Downloads

LOG:
- Salvar /tmp/duplicatas_classificadas.txt no Drive da pasta MEMORIA_CENTRAL
- Telegram resumo final com: X deletados, Y mantidos (original ausente), Z GB liberados

RETORNAR PRA CLAUDE CODE WEB:
- Total deletado (count + GB)
- Total mantido como suspeito
- Tempo gasto
- Lista de pastas mais afetadas
