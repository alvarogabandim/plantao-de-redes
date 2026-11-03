/* Plantão de Redes · aulas.js
 * Nível Trainee: aulas guiadas para quem nunca mexeu com rede.
 * Cada passo: explica o mínimo → pede um comando → confere na rede de verdade → explica o que aconteceu. */
(function (raiz) {
'use strict';
const M=raiz.Motor||require('./motor.js');const CLI=raiz.CLI||require('./cli.js');
const cmd=(dev,re)=>c=>c.dev===dev&&re.test(c.cmd);
const ip=(st,id)=>M.cfgIP(st,st.devs[id]);
const Cap=()=>raiz.Captura||require('./captura.js');
const capEm=(st,dev)=>!!(st.cap&&st.cap.ativo&&st.cap.ix===Cap().pontoDe(st,dev));
const tem=(st,fn)=>!!(st.cap&&st.cap.frames.some(fn));
const AULAS=[
{id:'a-ip',t:'O que é um endereço IP',obj:'Saber o que é IP e achar o IP de qualquer computador.',dev:'RECEP',passos:[
 {txt:'Toda máquina numa rede tem um <b>endereço IP</b>, como o endereço de uma casa: é por ele que as informações sabem para onde ir. Um IP tem 4 números separados por ponto, por exemplo <b>10.10.20.87</b>.',
  faca:'No console (aba <b>PC-RECEP01</b>, já aberta), digite <code>ipconfig</code> e aperte Enter.',ok:cmd('RECEP',/^ipconfig/),
  depois:'Achou a linha <b>Endereço IPv4</b>? Esse é o IP deste computador: <b>10.10.20.87</b>. As linhas Máscara e Gateway você vai entender daqui a pouco.'},
 {txt:'Cada equipamento tem o seu próprio IP. Vamos ver o de outro computador.',faca:'Clique na aba <b>PC-FAT02</b> (ou no PC-FAT02 no mapa) e rode <code>ipconfig</code>.',ok:cmd('FAT',/^ipconfig/),
  depois:'O IP dele é <b>10.10.10.42</b>. Compare: 10.10.<b>10</b>.42 e 10.10.<b>20</b>.87. O terceiro número é diferente porque eles estão em <b>setores (redes) diferentes</b>: Faturamento e Recepção.'},
 {txt:'No <b>mapa ao vivo</b>, embaixo do nome de cada equipamento aparece o IP. Os servidores ficam no meio, ligados ao CORE-01.',faca:'Clique no <b>SRV-PACS</b> no mapa e rode <code>ipconfig</code>.',ok:cmd('PACS',/^ipconfig/),
  depois:'O PACS (servidor de imagens do hospital) é <b>10.10.1.20</b>. Guarde esse número: vamos usá-lo bastante.'},
 {txt:'<b>Resumo:</b> IP é o endereço da máquina. No Windows, <code>ipconfig</code> mostra o IP. No suporte, é o primeiro comando de quase todo chamado de rede.'}]},

{id:'a-ping',t:'Ping: tem alguém aí?',obj:'Testar se um equipamento responde e entender a resposta.',dev:'RECEP',passos:[
 {txt:'O <b>ping</b> manda um pacotinho para um IP e espera a volta. Se voltar, existe caminho até lá.',faca:'No PC-RECEP01: <code>ping 10.10.1.20</code> (o PACS).',ok:cmd('RECEP',/^ping\s+10\.10\.1\.20$/),
  depois:'"Resposta de 10.10.1.20" 4 vezes = os 4 pacotes foram e voltaram. "tempo" é quanto demorou. A bolinha no mapa mostrou o caminho: PC → switch do andar (SW-1A) → CORE-01 → servidor.'},
 {txt:'Agora o contrário: um IP onde não existe ninguém.',faca:'<code>ping 10.10.1.99</code>',ok:cmd('RECEP',/^ping\s+10\.10\.1\.99$/),
  depois:'"Esgotado o tempo limite" = ninguém respondeu. Pode ser que o equipamento não exista, esteja desligado ou que o caminho esteja quebrado. É a primeira pista de qualquer problema de rede.'},
 {txt:'A internet também é só um destino com IP. 8.8.8.8 é um servidor do Google.',faca:'<code>ping 8.8.8.8</code>',ok:cmd('RECEP',/^ping\s+8\.8\.8\.8$/),
  depois:'Funcionou: o pacote saiu do hospital pelo firewall (FGT-HVC), foi até a internet e voltou. Veja no mapa: a bolinha subiu até INTERNET.'},
 {txt:'<b>Resumo:</b> <code>ping IP</code> testa se existe caminho. Resposta = ok. Tempo esgotado = algo no caminho ou no destino.'}]},

{id:'a-gw',t:'Máscara e gateway',obj:'Entender "mesma rede" e a porta de saída. Quebrar e consertar um gateway.',dev:'RECEP',passos:[
 {txt:'A <b>máscara</b> (255.255.255.0) diz quem é "vizinho". Com ela, quem tem os <b>3 primeiros números iguais</b> está na mesma rede: 10.10.20.87 e 10.10.20.1 são vizinhos; 10.10.1.20 não é. Para falar com quem não é vizinho, o PC entrega o pacote ao <b>gateway</b>, a porta de saída da rede.',
  faca:'No PC-RECEP01, rode <code>ipconfig</code> e ache a Máscara e o Gateway.',ok:cmd('RECEP',/^ipconfig/),
  depois:'Gateway Padrão = <b>10.10.20.1</b>. Tudo o que não começa com 10.10.20 vai primeiro para ele.'},
 {txt:'O <b>tracert</b> mostra cada parada (salto) do caminho.',faca:'<code>tracert 10.10.1.20</code>',ok:cmd('RECEP',/^tracert\s+10\.10\.1\.20$/),
  depois:'O salto 1 foi <b>10.10.20.1</b>, o gateway. Depois chegou no PACS. Para sair da própria rede, o PC sempre passa pelo gateway.'},
 {txt:'Agora vamos quebrar de propósito, colocando um gateway que não existe (10.10.20.254). Isso acontece muito quando alguém configura o IP na mão.',
  faca:'Digite: <code>netsh interface ip set address "Ethernet" static 10.10.20.87 255.255.255.0 10.10.20.254</code>',ok:c=>c.dev==='RECEP'&&c.st.devs.RECEP.nic.gw==='10.10.20.254',
  depois:'Pronto: o PC agora acha que a porta de saída é o 10.10.20.254, que não existe.'},
 {txt:'Teste os dois lados.',faca:'Rode <code>ping 10.10.20.1</code> (vizinho) e depois <code>ping 10.10.1.20</code> (fora da rede).',ok:c=>cmd('RECEP',/^ping\s+10\.10\.1\.20$/)(c)&&c.st.devs.RECEP.nic.gw==='10.10.20.254',
  depois:'O vizinho responde, mas o PACS não: "Host de destino inacessível". É o defeito clássico de gateway errado: <b>funciona dentro da sala, falha fora dela</b>.'},
 {txt:'O normal no hospital é o PC receber IP, máscara e gateway automaticamente de um serviço chamado <b>DHCP</b>.',faca:'Volte para automático: <code>netsh interface ip set address "Ethernet" dhcp</code> e teste <code>ping 10.10.1.20</code>.',
  ok:c=>c.dev==='RECEP'&&/^ping/.test(c.cmd)&&M.ping(c.st,'RECEP','10.10.1.20').tipo==='ok',
  depois:'Voltou! Você acabou de resolver seu primeiro defeito de rede de verdade.'},
 {txt:'<b>Resumo:</b> máscara diz quem é vizinho; gateway é a saída para o resto. Gateway errado = só a sala funciona. DHCP entrega a configuração certa automaticamente.'}]},

{id:'a-dns',t:'DNS: nomes viram IPs',obj:'Entender por que "o site não abre" às vezes não é a rede.',dev:'RECEP',passos:[
 {txt:'Ninguém decora IP. Usamos nomes, como <b>pacs.hvc.local</b>. O <b>DNS</b> é uma agenda que traduz nome em IP. O DNS do hospital é o servidor 10.10.1.10.',faca:'No PC-RECEP01: <code>nslookup pacs.hvc.local</code>',ok:cmd('RECEP',/^nslookup\s+pacs\.hvc\.local/),
  depois:'O servidor DNS (dns.hvc.local, 10.10.1.10) respondeu: <b>pacs.hvc.local = 10.10.1.20</b>.'},
 {txt:'Quando você usa um nome, o Windows pergunta ao DNS antes de mandar o pacote.',faca:'<code>ping pacs.hvc.local</code>',ok:cmd('RECEP',/^ping\s+pacs\.hvc\.local$/),
  depois:'Repare no <b>[10.10.1.20]</b> na resposta: o nome foi traduzido e só então o ping aconteceu.'},
 {txt:'Vamos quebrar: apontar o DNS para um servidor que não existe.',faca:'<code>netsh interface ip set dns "Ethernet" static 10.10.1.99</code> e depois <code>ping pacs.hvc.local</code>.',
  ok:c=>cmd('RECEP',/^ping\s+pacs/)(c)&&c.st.devs.RECEP.nic.dnsManual==='10.10.1.99',
  depois:'"Não pôde encontrar o host": o nome não foi traduzido. Agora teste <code>ping 10.10.1.20</code>: <b>funciona!</b> A rede está boa; o problema é só o DNS. O usuário vai dizer que "a internet caiu".'},
 {txt:'Conserte voltando o DNS para automático.',faca:'<code>netsh interface ip set dns "Ethernet" dhcp</code> e confirme com <code>ping pacs.hvc.local</code>.',
  ok:c=>c.dev==='RECEP'&&/^(ping|nslookup)/.test(c.cmd)&&!c.st.devs.RECEP.nic.dnsManual&&M.resolver(c.st,'RECEP','pacs.hvc.local').ok,
  depois:'Resolvido. Regra de ouro: <b>teste por IP e por nome separadamente</b>. Se por IP funciona e por nome não, é DNS.'}]},

{id:'a-sw',t:'O switch e as portas',obj:'Entrar num switch, ver as portas e desligar/religar uma.',dev:'SW1A',passos:[
 {txt:'O cabo do PC vai até uma <b>porta</b> de um <b>switch</b> no rack do andar. O PC-RECEP01 está na porta <b>Gi1/0/5</b> do <b>SW-1A</b> (Gi = Gigabit, 1/0/5 = porta 5). Switch Cisco tem modos: <b>&gt;</b> só olha, <b>#</b> é administrador.',
  faca:'Na aba <b>SW-1A</b> (já aberta), digite <code>enable</code>.',ok:c=>c.dev==='SW1A'&&CLI.T(c.st,'SW1A').modo!=='exec',depois:'O prompt mudou de <b>SW-1A&gt;</b> para <b>SW-1A#</b>: você está no modo administrador.'},
 {txt:'Comandos <b>show</b> mostram informação sem mudar nada. São seguros.',faca:'<code>show interfaces status</code>',ok:cmd('SW1A',/^sh\S*\s+int\S*\s+st/),
  depois:'Cada linha é uma porta. Gi1/0/5 e Gi1/0/6 estão <b>connected</b> (cabo ligado e funcionando). As outras estão <b>notconnect</b>: nada ligado.'},
 {txt:'Para mudar algo, entra-se no modo de configuração, depois na porta.',faca:'Digite em sequência: <code>configure terminal</code>, <code>interface gi1/0/5</code>, <code>shutdown</code>.',ok:c=>c.st.devs.SW1A.ifs['Gi1/0/5'].shut,
  depois:'A porta desligou. Veja no mapa: o link do PC-RECEP01 ficou <b>vermelho tracejado</b>. Se rodar <code>ipconfig</code> no PC agora, aparece "mídia desconectada", como se tirassem o cabo.'},
 {txt:'Religue a porta.',faca:'Ainda no SW-1A: <code>no shutdown</code>',ok:c=>!c.st.devs.SW1A.ifs['Gi1/0/5'].shut&&c.dev==='SW1A',depois:'Link verde de novo. "no" na frente de um comando desfaz o comando.'},
 {txt:'Mudança feita só fica na memória temporária. Se o switch reiniciar, ela some. Por isso sempre se <b>salva</b>.',faca:'<code>end</code> e depois <code>write memory</code>',ok:c=>c.dev==='SW1A'&&/^(wr|write|copy)/.test(c.cmd)&&!c.st.devs.SW1A.naoSalvo,
  depois:'"[OK]": salvo. <b>Resumo:</b> enable → show para olhar → configure terminal → interface → mudança → end → write memory.'}]},

{id:'a-vlan',t:'VLAN: setores separados no mesmo switch',obj:'Ver em que VLAN está cada porta, quebrar e consertar.',dev:'SW1A',passos:[
 {txt:'Recepção e Faturamento ficam no <b>mesmo switch</b> (SW-1A), mas em redes diferentes. Quem separa é a <b>VLAN</b> ("rede virtual"): cada porta recebe um número. Recepção = VLAN <b>20</b>; Faturamento = VLAN <b>10</b>.',
  faca:'No SW-1A: <code>enable</code> e depois <code>show vlan brief</code>.',ok:cmd('SW1A',/^sh\S*\s+vlan/),depois:'Gi1/0/5 (recepção) aparece na VLAN 20 e Gi1/0/6 (faturamento) na VLAN 10.'},
 {txt:'Vamos colocar a porta da recepção na VLAN 99, a "quarentena", que não tem gateway nem DHCP.',faca:'<code>configure terminal</code>, <code>interface gi1/0/5</code>, <code>switchport access vlan 99</code>',ok:c=>c.st.devs.SW1A.ifs['Gi1/0/5'].vlan===99,
  depois:'Feito. O link continua verde (o cabo está ok), mas a porta agora está na rede errada.'},
 {txt:'O PC ainda guarda o IP antigo. Para ele pedir um novo, o técnico faz release e renew.',faca:'No PC-RECEP01: <code>ipconfig /release</code> e depois <code>ipconfig /renew</code>.',
  ok:c=>c.dev==='RECEP'&&/renew/.test(c.cmd)&&ip(c.st,'RECEP').apipa,
  depois:'Erro ao contatar o DHCP e o IP virou <b>169.254.x.x</b>: o PC não achou ninguém para dar IP e inventou um (APIPA). <b>Viu 169.254? Pense em VLAN errada ou DHCP fora.</b>'},
 {txt:'Conserte a porta.',faca:'No SW-1A: <code>interface gi1/0/5</code> e <code>switchport access vlan 20</code>. Depois no PC: <code>ipconfig</code>.',
  ok:c=>c.st.devs.SW1A.ifs['Gi1/0/5'].vlan===20&&c.dev==='RECEP'&&/^ipconfig/.test(c.cmd)&&!ip(c.st,'RECEP').apipa,
  depois:'IP 10.10.20.87 de volta. <b>Resumo:</b> VLAN separa setores no mesmo switch; porta na VLAN errada = PC na rede errada.'}]},

{id:'a-trunk',t:'Trunk: várias VLANs no mesmo cabo',obj:'Ver como os switches se ligam e carregam várias VLANs.',dev:'SW3A',passos:[
 {txt:'Entre um switch e outro passa um cabo só, mas ele precisa levar todas as VLANs. Esse tipo de porta se chama <b>trunk</b>: cada pacote vai com uma etiqueta dizendo de qual VLAN ele é.',
  faca:'Na aba <b>SW-3A</b>: <code>enable</code> e <code>show interfaces trunk</code>.',ok:cmd('SW3A',/^sh\S*\s+int\S*\s+tr/),
  depois:'<b>Gi1/0/49</b> (até o core) leva as VLANs 10,20,30. A <b>Gi1/0/50</b> (cabo reserva até o SW-1A) aparece sem VLANs encaminhando: ela está bloqueada de propósito para não formar um loop. No mapa, é o link amarelo com "BLK".'},
 {txt:'O switch descobre os vizinhos sozinho (protocolo CDP). Ótimo para saber "este cabo vai para onde?".',faca:'<code>show cdp neighbors</code>',ok:cmd('SW3A',/^sh\S*\s+cdp/),
  depois:'Gi1/0/49 → CORE-01 Gi1/0/4 e Gi1/0/50 → SW-1A Gi1/0/48. Bate com o mapa. <b>Resumo:</b> porta de PC = access (1 VLAN); porta entre switches = trunk (várias VLANs).'}]},

{id:'a-core',t:'O core e o roteamento',obj:'Ver onde moram os gateways e como o tráfego sai para a internet.',dev:'CORE',passos:[
 {txt:'O <b>CORE-01</b> é o switch central e também <b>roteador</b>: é ele que liga as VLANs entre si. Os gateways (10.10.10.1, 10.10.20.1, 10.10.30.1) são interfaces dele, chamadas "interface VLAN".',
  faca:'Na aba <b>CORE-01</b>: <code>enable</code> e <code>show ip interface brief</code>.',ok:cmd('CORE',/^sh\S*\s+ip\s+int/),
  depois:'Vlan10, Vlan20, Vlan30 e Vlan100 com IPs terminados em .1: são os gateways de cada setor. Todas <b>up up</b> = funcionando.'},
 {txt:'O roteador decide o caminho olhando a <b>tabela de rotas</b>, uma espécie de GPS.',faca:'<code>show ip route</code>',ok:cmd('CORE',/^sh\S*\s+ip\s+ro/),
  depois:'<b>C</b> = redes ligadas direto nele. <b>S* 0.0.0.0/0 via 10.10.0.1</b> = rota padrão: "qualquer outro destino, mande para o firewall". Sem essa linha, ninguém sai para a internet.'},
 {txt:'O próprio core também pode testar.',faca:'<code>ping 8.8.8.8</code>',ok:cmd('CORE',/^ping\s+8\.8\.8\.8$/),depois:'"!!!!!" = 5 respostas (no Cisco cada ! é uma resposta e cada . é uma falha).'}]},

{id:'a-fw',t:'Firewall e internet',obj:'Ver o caminho até a internet e o NAT acontecendo.',dev:'RECEP',passos:[
 {txt:'O <b>FortiGate</b> (FGT-HVC) fica entre o hospital e a internet. Ele decide o que pode passar (<b>políticas</b>) e troca o IP interno pelo IP público do hospital (<b>NAT</b>).',faca:'No PC-RECEP01: <code>tracert 8.8.8.8</code>',ok:cmd('RECEP',/^tracert\s+8\.8\.8\.8$/),
  depois:'Saltos: 10.10.20.1 (gateway no core) → 10.10.0.1 (firewall) → 200.160.2.1 (operadora) → 8.8.8.8.'},
 {txt:'Vamos ver a regra que deixa o hospital navegar.',faca:'Na aba <b>FGT-HVC</b>: <code>show firewall policy</code>',ok:cmd('FGT',/^show\s+firewall\s+policy/),
  depois:'Política 1: da LAN (<b>port2</b>) para a internet (<b>port1</b>), action <b>accept</b>, com <b>nat enable</b>. Sem ela, nada sai.'},
 {txt:'Agora veja o NAT na prática com uma captura de pacotes.',faca:'No PC-RECEP01 rode <code>ping 8.8.8.8</code>. Depois, no FGT-HVC: <code>diagnose sniffer packet any \'icmp\' 4</code>',ok:cmd('FGT',/^diag\S*\s+sniffer/),
  depois:'Na <b>port2 in</b> o pacote chega com 10.10.20.87; na <b>port1 out</b> sai com <b>200.160.2.2</b>. Isso é o NAT. <b>Fim do Trainee!</b> Falta só a parte de captura de pacotes (próximas 4 aulas).'}]},
/* ---------- Trainee · captura de pacotes (Fase 2) ---------- */
{id:'a-cap1',t:'Primeira captura (Wireshark)',obj:'Gravar pacotes, ler as camadas e filtrar, como no Wireshark.',dev:'RECEP',passos:[
 {txt:'O <b>Wireshark</b> é o programa que mostra cada pacote que passa num cabo. A <b>Captura de pacotes</b> daqui funciona igual: você escolhe onde "escutar", grava, faz o tráfego acontecer e depois lê.',
  faca:'No card <b>Captura de pacotes</b> (no celular, aba <b>Captura</b>), escolha <b>PC-RECEP01 · cabo do equipamento</b> e clique <b>● Gravar</b>.',ok:c=>c.dev==='CAP'&&c.cmd==='gravar'&&capEm(c.st,'RECEP'),
  depois:'Gravando. No mapa, o cabo escutado ganhou a marca <b>REC</b>.'},
 {txt:'Agora gere tráfego.',faca:'No console do <b>PC-RECEP01</b>: <code>ping 10.10.1.20</code>.',ok:c=>c.dev==='RECEP'&&/^ping\s+10\.10\.1\.20$/.test(c.cmd)&&capEm(c.st,'RECEP'),
  depois:'Os pacotes do ping passaram por esse cabo e foram gravados.'},
 {txt:'Hora de ler.',faca:'Clique em <b>■ Parar</b>. Depois clique numa linha rosa com <b>Echo (ping) request</b>.',ok:c=>c.dev==='CAP'&&c.cmd==='sel'&&c.R&&c.R.l4&&c.R.l4.icmp&&c.R.l4.icmp.t===8,
  depois:'Embaixo aparecem as <b>camadas</b>, de fora para dentro: <b>Ethernet</b> (MAC de quem mandou e de quem recebe neste cabo), <b>IPv4</b> (IP de origem e destino final, e o TTL) e <b>ICMP</b> (o ping: tipo 8 = pedido). Repare: o MAC de destino é o do <b>gateway</b> (CORE-01 Vlan20), não o do PACS. O PC entrega ao gateway, mas o IP de destino continua 10.10.1.20.'},
 {txt:'Lista cheia? Filtre, igual no Wireshark.',faca:'Digite <code>icmp</code> no campo de filtro e aperte Enter (ou toque no botão <b>icmp</b>).',ok:c=>c.dev==='CAP'&&c.cmd==='filtro'&&/^icmp$/i.test(c.R||''),
  depois:'Ficaram só os pings: 4 pedidos (request) e 4 respostas (reply). O que sumiu: <b>STP</b> (o switch avisando a rede a cada 2 s) e <b>ARP</b>, assunto da próxima aula.'},
 {txt:'Agora uma conexão TCP, como a do sistema web do PACS.',faca:'Clique <b>● Gravar</b> de novo, rode <code>tnc 10.10.1.20 -port 443</code> no PC-RECEP01, clique <b>■ Parar</b> e filtre <code>tcp</code>.',
  ok:c=>c.dev==='CAP'&&c.cmd==='filtro'&&/^tcp$/i.test(c.R||'')&&tem(c.st,f=>f.l4&&f.l4.tcp&&f.l4.tcp.flags==='SA'),
  depois:'O <b>aperto de mão em 3 passos</b> do TCP: <b>SYN</b> ("quero conectar") → <b>SYN, ACK</b> ("pode vir") → <b>ACK</b> ("combinado"). Sem esses 3, não existe conexão. É a primeira coisa que um analista procura quando "o sistema não abre".'},
 {txt:'<b>Resumo:</b> escolha onde escutar → grave → gere tráfego → pare → filtre → clique e leia as camadas. É o mesmo fluxo do Wireshark e do tcpdump. Se quiser, o botão <b>.pcap</b> baixa a captura para abrir no Wireshark de verdade no PC.'}]},

{id:'a-cap2',t:'ARP: quem tem este IP?',obj:'Ver o ARP acontecendo e provar que um gateway não existe.',dev:'RECEP',passos:[
 {txt:'O IP é o endereço lógico. Dentro do cabo, quem entrega é o <b>MAC</b> (endereço físico da placa de rede). Antes de mandar, o PC precisa descobrir o MAC: ele pergunta para todos "quem tem o IP X?". Isso é o <b>ARP</b>.',
  faca:'Grave no <b>PC-RECEP01 · cabo do equipamento</b>. No console do PC: <code>arp -d</code> (apaga a memória de MACs) e depois <code>ping 10.10.1.20</code>.',
  ok:c=>c.dev==='RECEP'&&/^ping/.test(c.cmd)&&capEm(c.st,'RECEP')&&tem(c.st,f=>f.eth==='arp'),depois:'Gravado.'},
 {txt:'Veja só o ARP.',faca:'Clique <b>■ Parar</b> e filtre <code>arp</code>.',ok:c=>c.dev==='CAP'&&c.cmd==='filtro'&&/^arp$/i.test(c.R||'')&&tem(c.st,f=>f.eth==='arp'&&f.arp.op===2),
  depois:'Dois pacotes: <b>Who has 10.10.20.1? Tell 10.10.20.87</b> ("quem tem 10.10.20.1? avise 10.10.20.87"), enviado para <b>Broadcast</b> (todos), e <b>10.10.20.1 is at 00:a1:c0:de:00:14</b>, a resposta do gateway. O PC perguntou pelo <b>gateway</b>, não pelo PACS, porque o PACS está em outra rede.'},
 {txt:'Agora com o gateway errado da aula 3.',faca:'No PC: <code>netsh interface ip set address "Ethernet" static 10.10.20.87 255.255.255.0 10.10.20.254</code>. Grave de novo, rode <code>ping 10.10.1.20</code>, pare e filtre <code>arp</code>.',
  ok:c=>c.dev==='CAP'&&c.cmd==='filtro'&&/^arp$/i.test(c.R||'')&&tem(c.st,f=>f.eth==='arp'&&f.arp.tpa==='10.10.20.254')&&!tem(c.st,f=>f.eth==='arp'&&f.arp.op===2&&f.arp.spa==='10.10.20.254'),
  depois:'Só perguntas <b>Who has 10.10.20.254?</b>, repetidas e <b>sem resposta</b>: ninguém tem esse IP. Na vida real, é assim que você prova que o gateway configurado não existe, sem depender do que o usuário diz.'},
 {txt:'Conserte.',faca:'No PC: <code>netsh interface ip set address "Ethernet" dhcp</code> e depois <code>ping 10.10.1.20</code>.',ok:c=>c.dev==='RECEP'&&/^ping/.test(c.cmd)&&c.st.devs.RECEP.nic.dhcp&&M.ping(c.st,'RECEP','10.10.1.20').tipo==='ok',
  depois:'<b>Resumo:</b> ARP traduz IP em MAC dentro da mesma rede. Pergunta sem resposta = o IP não existe naquela rede (gateway errado, equipamento desligado ou VLAN errada).'}]},

{id:'a-cap3',t:'DHCP em 4 pacotes',obj:'Ver como o PC ganha IP e por que aparece o 169.254.',dev:'FAT',passos:[
 {txt:'Quando o PC liga, ele não tem IP. Ele pede a um servidor <b>DHCP</b> em 4 passos, que se decoram como <b>DORA</b>: <b>D</b>iscover, <b>O</b>ffer, <b>R</b>equest, <b>A</b>ck.',
  faca:'Grave no <b>PC-FAT02 · cabo do equipamento</b>. No console do <b>PC-FAT02</b>: <code>ipconfig /release</code> e depois <code>ipconfig /renew</code>.',
  ok:c=>c.dev==='FAT'&&/renew/.test(c.cmd)&&capEm(c.st,'FAT')&&tem(c.st,f=>f.l4&&f.l4.dhcp&&f.l4.dhcp.t===5),depois:'O PC pegou IP de novo, e tudo foi gravado.'},
 {txt:'Leia a conversa.',faca:'Clique <b>■ Parar</b>, filtre <code>dhcp</code> e clique no pacote <b>DHCP Offer</b>.',ok:c=>c.dev==='CAP'&&c.cmd==='sel'&&c.R&&c.R.l4&&c.R.l4.dhcp&&c.R.l4.dhcp.t===2,
  depois:'<b>Discover</b>: "tem algum servidor DHCP aí?", de 0.0.0.0 para 255.255.255.255 (todos). <b>Offer</b>: o CORE-01 oferece o IP 10.10.10.42, com máscara, gateway e DNS (veja nos detalhes). <b>Request</b>: "quero esse". <b>ACK</b>: "é seu". O Release, antes deles, foi o PC devolvendo o IP.'},
 {txt:'E se o PC cair na VLAN errada?',faca:'No <b>SW-1A</b>: <code>enable</code>, <code>configure terminal</code>, <code>interface gi1/0/6</code>, <code>switchport access vlan 99</code>. Depois grave no PC-FAT02 e rode <code>ipconfig /renew</code> nele.',
  ok:c=>c.dev==='FAT'&&/renew/.test(c.cmd)&&c.st.devs.SW1A.ifs['Gi1/0/6'].vlan===99&&capEm(c.st,'FAT')&&tem(c.st,f=>f.l4&&f.l4.dhcp&&f.l4.dhcp.t===1)&&!tem(c.st,f=>f.l4&&f.l4.dhcp&&f.l4.dhcp.t===2),
  depois:'Pare e veja: só <b>Discover</b>, repetido, e nenhum Offer. Na VLAN 99 não existe servidor DHCP. É exatamente isso que deixa o PC com IP 169.254.'},
 {txt:'Conserte.',faca:'No SW-1A (ainda na interface gi1/0/6): <code>switchport access vlan 10</code>. Depois, no PC-FAT02: <code>ipconfig /renew</code>.',
  ok:c=>c.dev==='FAT'&&/renew/.test(c.cmd)&&c.st.devs.SW1A.ifs['Gi1/0/6'].vlan===10&&!!c.st.devs.FAT.lease,
  depois:'<b>Resumo:</b> DHCP = DORA. Só Discover, sem Offer = ninguém responde naquela VLAN (VLAN errada, gateway/DHCP desligado no core ou trunk sem a VLAN).'}]},

{id:'a-cap4',t:'DNS na captura',obj:'Ver perguntas e respostas de DNS e o encaminhamento para a internet.',dev:'LAUDO',passos:[
 {txt:'Toda vez que você usa um nome, o PC manda uma pergunta <b>DNS</b> (UDP, porta 53) e espera a resposta.',
  faca:'Grave no <b>PC-LAUDO03 · cabo do equipamento</b>. No PC-LAUDO03: <code>nslookup pacs.hvc.local</code>. Pare e filtre <code>dns</code>.',
  ok:c=>c.dev==='CAP'&&c.cmd==='filtro'&&/^dns$/i.test(c.R||'')&&tem(c.st,f=>f.l4&&f.l4.dns&&f.l4.dns.resp&&f.l4.dns.a==='10.10.1.20'),
  depois:'<b>Standard query … A pacs.hvc.local</b> é a pergunta. <b>Standard query response … A 10.10.1.20</b> é a resposta. O número 0x… (ID) liga a resposta à pergunta certa.'},
 {txt:'Um nome que não existe.',faca:'Grave de novo, rode <code>nslookup naoexiste.hvc.local</code>, pare e filtre <code>dns</code>.',
  ok:c=>c.dev==='CAP'&&c.cmd==='filtro'&&/^dns$/i.test(c.R||'')&&tem(c.st,f=>f.l4&&f.l4.dns&&f.l4.dns.rcode===3),
  depois:'<b>No such name</b>: o servidor respondeu, mas o nome não existe. É bem diferente de não ter resposta nenhuma, que significa servidor fora do ar ou sem caminho. Ler essa diferença economiza horas de chamado.'},
 {txt:'E os nomes da internet? O DNS do hospital pergunta para o 8.8.8.8 (Google).',faca:'Escolha o ponto <b>FGT-HVC port1 ↔ operadora (WAN, internet)</b>, grave, rode <code>nslookup google.com</code> no PC-LAUDO03, pare e filtre <code>dns</code>.',
  ok:c=>c.dev==='CAP'&&c.cmd==='filtro'&&/^dns$/i.test(c.R||'')&&c.st.cap&&c.st.cap.ix===Cap().pontoDe(c.st,'WAN')&&tem(c.st,f=>f.l4&&f.l4.dns&&f.l4.dns.q==='google.com'&&f.ip.src==='200.160.2.2'),
  depois:'Na saída para a internet, a pergunta não é do PC: é do <b>SRV-DNS</b>, e com o IP <b>200.160.2.2</b>, o IP público do hospital (NAT do FortiGate). Você acabou de ver o encaminhamento de DNS e o NAT acontecendo no cabo. Fim das aulas de captura!'}]}
];
const A={AULAS};
if(typeof module!=='undefined'&&module.exports)module.exports=A;else raiz.Aulas=A;
})(typeof window!=='undefined'?window:globalThis);
