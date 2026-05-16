# Fix: `claw.hairtech.org` retorna 404

**Pendência 12.5 do Mestre v6.0 (HairTech).**
**Status**: a aplicar manualmente no arquivo `/opt/hairtech-openclaw/docker-compose.yml` no VPS (esse arquivo não vive neste repo).

## Diagnóstico

O container `hairtech-openclaw` está rodando (`docker ps` mostra `Up`, porta 18789), mas o subdomínio `claw.hairtech.org` retorna 404 do Traefik. Causa raiz: o serviço `hairtech-openclaw` no compose do OpenClaw **não tem as labels Traefik corretas** e/ou **não está conectado à network `web`** (a network compartilhada do Traefik).

O padrão correto, espelhando o que já funciona no AV (`docker-compose.yml` deste repo, serviço `assistente-virtual`), é o snippet abaixo.

## Snippet a aplicar

**Antes de editar**, fazer backup obrigatório (regra Parte 12 do RELATORIO_DEFINITIVO):

```bash
cd /opt/hairtech-openclaw
cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d_%H%M%S)
```

No serviço `hairtech-openclaw` do `docker-compose.yml`, garantir:

```yaml
services:
  hairtech-openclaw:
    # ... (mantém image, container_name, restart, env, volumes existentes)
    networks:
      - default            # ou o nome interno do projeto OpenClaw
      - web                # <-- ADICIONAR (Traefik network)
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=web"
      - "traefik.http.routers.openclaw.rule=Host(`claw.hairtech.org`)"
      - "traefik.http.routers.openclaw.entrypoints=websecure"
      - "traefik.http.routers.openclaw.tls.certresolver=letsencrypt"
      - "traefik.http.routers.openclaw.priority=200"
      - "traefik.http.services.openclaw.loadbalancer.server.port=18789"

networks:
  web:
    external: true       # <-- ADICIONAR se ainda não declarada
```

Notas importantes:
- A porta `18789` é o gateway interno do OpenClaw, conforme Mestre v6.0 §2. Não muda.
- `entrypoints=websecure` faz Traefik publicar em 443; `tls.certresolver=letsencrypt` aciona certificado automático.
- `priority=200` é menor que a do AV (300) — não conflita, porque o Host é diferente (`claw.hairtech.org` ≠ `hairtech.org`).
- Se o OpenClaw escutar em outra porta interna que não 18789 (verificar com `docker inspect hairtech-openclaw | grep ExposedPorts`), trocar o número em `loadbalancer.server.port`.

## Aplicação

```bash
cd /opt/hairtech-openclaw
# editar docker-compose.yml conforme acima (vim/nano)
docker compose up -d --force-recreate hairtech-openclaw
sleep 10
```

## Validação

```bash
# 1. Container subiu com as networks certas:
docker inspect hairtech-openclaw --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
#    esperado: aparecer 'web' na lista

# 2. Traefik enxerga o roteador:
docker exec traefik-traefik-1 traefik api routers 2>/dev/null | grep openclaw || \
  echo "(traefik api pode estar desligada; tentar pelo dashboard)"

# 3. HTTP 200 (ou redirect HTTPS) em vez de 404:
curl -sS -o /dev/null -w "HTTP %{http_code}  ->  %{redirect_url}\n" -L https://claw.hairtech.org/

# 4. Certificado Let's Encrypt emitido:
echo | openssl s_client -connect claw.hairtech.org:443 -servername claw.hairtech.org 2>/dev/null \
  | openssl x509 -noout -issuer -dates | head -3
```

Resultado esperado em (3): `HTTP 200` (ou `HTTP 302` redirecionando dentro do OpenClaw, dependendo da rota raiz).

## Rollback

Se algo quebrar:

```bash
cd /opt/hairtech-openclaw
cp docker-compose.yml.bak.<TIMESTAMP> docker-compose.yml
docker compose up -d --force-recreate hairtech-openclaw
```

## Itens fora do escopo

- **DNS de `claw.hairtech.org`**: o relatório indica que a resolução já aponta pro IP da VPS (já testado, retornava 403/404 — não é DNS, é Traefik não enxergando o backend). Confirmar com `dig claw.hairtech.org +short` se houver dúvida.
- **Firewall**: Pendência 12.4 (Tailscale) é separada. Mesmo após corrigir o 404, recomenda-se restringir a porta 18789 pública e expor o OpenClaw apenas via Tailscale 100.0.0.0/8.
- **Senha do gateway OpenClaw**: não tocar aqui. Auth do OpenClaw é responsabilidade do plugin `device-pair`, configurado em `/opt/hairtech-openclaw/config/`.
