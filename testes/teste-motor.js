/* Teste automático: para cada defeito, gera o chamado, confirma que quebrou,
   aplica a correção DIGITANDO os comandos nos consoles e confirma que a matriz inteira passa. */
const M=require('../motor.js'),CLI=require('../cli.js');
let falhou=0;const ok=(c,msg)=>{if(!c){falhou++;console.log('  ✗ '+msg)}};
const base=M.criarRede();ok(M.validar(base,{defeitos:[]}).length===0,'rede limpa deve passar na matriz');
const SHOW={CORE:['show ip route','show ip interface brief','show interfaces status','show interfaces trunk','show spanning-tree','show etherchannel summary','show access-lists','show running-config','show mac address-table','show cdp neighbors','show logging','show ip dhcp binding','show interfaces gi1/0/4','show vlan brief','ping 8.8.8.8','traceroute 10.10.20.87'],
  SW1A:['show interfaces status','show spanning-tree vlan 20','show etherchannel summary','show interfaces trunk','show mac address-table'],SW3A:['show spanning-tree','show interfaces gi1/0/49','show logging','show running-config interface gi1/0/5'],
  FGT:['get router info routing-table all','show firewall policy','show full-configuration firewall policy','show router static','execute ping 8.8.8.8',"diagnose sniffer packet any 'icmp' 4",'diagnose debug flow trace start 10','execute traceroute 8.8.8.8'],
  RECEP:['ipconfig /all','ping 8.8.8.8','tracert 8.8.8.8','nslookup google.com','arp -a','tnc 10.10.1.20 -port 443'],TOMO:['rede mostrar','dicom eco','ping 10.10.1.20']};
for(const f of M.DEFEITOS){for(const seed of [11,222,3333,44444]){
  const{st,ch}=M.novoChamado(5,seed,{forcar:f.id});const x=ch.defeitos[0];
  ok(x.testes.some(t=>!M.rodarTeste(st,t)),`${f.id}: o defeito deveria quebrar algo`);
  for(const[dev,cmds]of Object.entries(SHOW))for(const c of cmds){if(dev!=='FGT'&&dev!=='RECEP'&&dev!=='TOMO')CLI.executar(st,dev,'enable');const r=CLI.executar(st,dev,c);ok(!r.linhas.some(l=>l[0]==='bad'&&/Erro interno/.test(l[1])),`${f.id}: erro interno em ${dev}: ${c}`)}
  for(const fx of x.f.cmds(x.ctx)){CLI.T(st,fx.dev).modo='exec';for(const l of fx.linhas){const r=CLI.executar(st,fx.dev,l);const b=r.linhas.filter(z=>z[0]==='bad');ok(!b.length,`${f.id}: comando rejeitado em ${fx.dev}: "${l}" → ${b.map(z=>z[1]).join(' | ')}`)}}
  const fal=M.validar(st,ch);ok(fal.length===0,`${f.id} (seed ${seed}): ainda falha após correção: ${fal.join('; ')}`);
  ok(!Object.values(st.devs).some(d=>d.naoSalvo),`${f.id}: ficou config sem salvar`);
}}
for(let n=1;n<=12;n++)for(let s=0;s<15;s++){const{ch}=M.novoChamado(n,s*101+n);ok(ch.defeitos.length>=1,'gerador')}
console.log(falhou?`${falhou} falha(s)`:'Todos os testes passaram.');process.exit(falhou?1:0);
