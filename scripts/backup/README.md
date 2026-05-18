# Backup off-site (Backblaze B2)

Sistema de backup encriptado em transit, retenção 30 dias, ~R$0,05/mês para os 1-2GB típicos da clínica.

## Custo Backblaze B2

- **Storage**: $0.006/GB/mês (~R$0,03/GB)
- **Download**: $0.01/GB (gratuito até 3x o storage)
- **Free tier**: 10GB storage + 1GB download/dia
- **Para a clínica**: ~R$0,05-0,30/mês

## Setup (3 passos)

### 1. Criar conta Backblaze e bucket

1. Cadastrar em <https://www.backblaze.com/b2/sign-up.html>
2. Criar bucket privado: **hairtech-backups**
3. **App Keys** → **Add a New Application Key**:
   - Name: `hairtech-vps-backup`
   - Bucket: hairtech-backups (limitar a este bucket)
   - Capabilities: ler + escrever
4. Copiar `keyID` e `applicationKey` (só aparecem uma vez)

### 2. Adicionar credenciais ao .env

```bash
# /home/user/nodejs/.env
B2_ACCOUNT_ID=<keyID>
B2_APPLICATION_KEY=<applicationKey>
B2_BUCKET=hairtech-backups
```

### 3. Instalar e ativar

```bash
chmod +x /home/user/nodejs/scripts/backup/*.sh
bash /home/user/nodejs/scripts/backup/install-rclone-b2.sh
bash /home/user/nodejs/scripts/backup/install-cron-backup-b2.sh
```

## O que é feito backup

Diariamente às 04:00 BRT:

| Item | Caminho B2 | Tamanho típico |
|---|---|---|
| Dump Postgres (gzip) | `hairtech-backups/postgres/YYYYMMDD/` | 5-50 MB |
| Tar do código + prontuários | `hairtech-backups/code/YYYYMMDD/` | 10-100 MB |
| Tar do .env (secrets) | `hairtech-backups/env/YYYYMMDD/` | <1 KB |

Telegram avisa quando termina. Backups locais (em `/opt/backup`) **continuam** — o off-site é uma camada adicional.

## Restaurar de um backup

```bash
# Listar backups disponíveis
rclone ls b2hairtech:hairtech-backups/postgres/

# Baixar postgres de 18/05
rclone copy b2hairtech:hairtech-backups/postgres/20260518/ /tmp/restore/

# Restaurar
gunzip -c /tmp/restore/hairtech-pg-20260518.sql.gz | \
  docker exec -i hairtech-postgres psql -U hairtech hairtechdb
```

## Retenção

O `backup-offsite-b2.sh` apaga automaticamente backups com mais de 30 dias. Para reter mais, edite a linha `--min-age 30d`.

## Alternativas se não quiser B2

- **Cloudflare R2**: $15/TB ($0,015/GB) — sem egress fee, mais caro storage
- **Wasabi**: $5.99/TB ($0.006/GB), mínimo R$30/mês
- **Google Drive**: já no Workspace, mas exige rclone com OAuth (mais complexo)

Backblaze B2 é o mais barato e simples para volumes pequenos como o seu.
