# Plantão de Redes

Simulador de chamados de rede em português para treinar troubleshooting na prática,
mirando o nível **Analista de Redes Pleno**: VLAN, trunk, STP, LACP, roteamento,
FortiGate, Wireshark/tcpdump.

**Jogar:** https://alvarogabandim.github.io/plantao-de-redes/
(a versão 1, com 9 chamados roteirizados, continua em `/v1/`)

## Como funciona (Fase 1)
Nada é roteirizado. Existe uma rede de hospital funcionando e o gerador quebra algo nela:

- **Motor de rede** (`motor.js`): estado de cada equipamento e cálculo camada por camada
  — enlace e duplex → LACP → VLAN/trunk 802.1Q → STP por VLAN (raiz, porta raiz, bloqueio, loop)
  → L3 salto a salto (ARP, rotas, ACL do core, RPF, política e NAT do FortiGate) → DNS e TCP.
  O ping vai e volta de verdade; o tracert mostra onde parou.
- **Consoles** (`cli.js`): Cisco IOS (CORE-01, SW-1A, SW-3A), FortiOS (FGT-HVC),
  Windows (PCs e servidores) e o painel do tomógrafo. Comandos aceitam abreviação (`sh int st`, `conf t`).
- **Mapa ao vivo**: links ficam vermelhos, bloqueados pelo STP, com perda ou em tempestade
  conforme o estado real; o pacote do ping anda pelo caminho calculado.
- **Gerador de defeitos**: 16 tipos em 3 níveis (gateway, DNS, porta desligada, VLAN errada,
  BPDU Guard, trunk sem a VLAN, VLAN apagada, SVI desligada, rota padrão, duplex mismatch,
  LACP on × active, loop com bpdufilter, ACL com curinga errada, política, NAT e rota de retorno
  do FortiGate). A partir do 8º chamado podem vir dois defeitos juntos.
- **Encerramento**: só fecha se a matriz de testes da rede inteira passar (ping, DNS, DICOM 104,
  HTTPS 443, Po1 agregado, sem loop, sem perda, sem err-disabled). Senão o usuário reabre.

Modos: **Plantão** (SLA por prioridade, 3 vidas, pontos e recorde) e **Treino** (escolhe o defeito, sem SLA).

## Rodar e testar
É HTML + JS puro, sem build. Abra `index.html` com qualquer servidor estático
(`python3 -m http.server`).

```bash
node testes/teste-aulas.js   # executa cada aula do Trainee digitando os comandos
node testes/teste-motor.js   # quebra cada defeito, corrige digitando os comandos nos consoles e valida a rede
```

## Fases
1. ✅ Motor de rede real + mapa da topologia + gerador de defeitos aleatórios
   - ✅ App para celular: instalável na tela inicial (PWA), funciona sem internet, abas Chamado/Mapa/Console
   - ✅ Trilha Trainee → Júnior → Pleno: 9 aulas guiadas do zero (IP, ping, gateway, DNS, switch, VLAN, trunk, core, firewall) + 16 chamados reais com desbloqueio e estrelas; Plantão usa só o que já foi liberado
2. Captura estilo Wireshark + gestão de mudança com rollback
3. Modo Construir + diagnóstico de pontos fracos + entrevista simulada
