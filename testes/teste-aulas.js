/* Executa cada aula do Trainee digitando os comandos e confere que todo passo é concluído. */
const M=require('../motor.js'),CLI=require('../cli.js'),K=require('../captura.js'),{AULAS}=require('../aulas.js');
/* ações de captura no roteiro: ['CAP','gravar:RECEP'] · ['CAP','parar'] · ['CAP','filtro:icmp'] · ['CAP','sel:icmp8'|'sel:dhcp2'] */
const ROTEIRO={
 'a-ip':[[['RECEP','ipconfig']],[['FAT','ipconfig']],[['PACS','ipconfig']]],
 'a-ping':[[['RECEP','ping 10.10.1.20']],[['RECEP','ping 10.10.1.99']],[['RECEP','ping 8.8.8.8']]],
 'a-gw':[[['RECEP','ipconfig']],[['RECEP','tracert 10.10.1.20']],[['RECEP','netsh interface ip set address "Ethernet" static 10.10.20.87 255.255.255.0 10.10.20.254']],[['RECEP','ping 10.10.20.1'],['RECEP','ping 10.10.1.20']],[['RECEP','netsh interface ip set address "Ethernet" dhcp'],['RECEP','ping 10.10.1.20']]],
 'a-dns':[[['RECEP','nslookup pacs.hvc.local']],[['RECEP','ping pacs.hvc.local']],[['RECEP','netsh interface ip set dns "Ethernet" static 10.10.1.99'],['RECEP','ping pacs.hvc.local']],[['RECEP','netsh interface ip set dns "Ethernet" dhcp'],['RECEP','ping pacs.hvc.local']]],
 'a-sw':[[['SW1A','enable']],[['SW1A','show interfaces status']],[['SW1A','configure terminal'],['SW1A','interface gi1/0/5'],['SW1A','shutdown']],[['SW1A','no shutdown']],[['SW1A','end'],['SW1A','write memory']]],
 'a-vlan':[[['SW1A','enable'],['SW1A','show vlan brief']],[['SW1A','configure terminal'],['SW1A','interface gi1/0/5'],['SW1A','switchport access vlan 99']],[['RECEP','ipconfig /release'],['RECEP','ipconfig /renew']],[['SW1A','interface gi1/0/5'],['SW1A','switchport access vlan 20'],['RECEP','ipconfig']]],
 'a-trunk':[[['SW3A','enable'],['SW3A','show interfaces trunk']],[['SW3A','show cdp neighbors']]],
 'a-core':[[['CORE','enable'],['CORE','show ip interface brief']],[['CORE','show ip route']],[['CORE','ping 8.8.8.8']]],
 'a-fw':[[['RECEP','tracert 8.8.8.8']],[['FGT','show firewall policy']],[['RECEP','ping 8.8.8.8'],['FGT',"diagnose sniffer packet any 'icmp' 4"]]],
 'a-cap1':[[['CAP','gravar:RECEP']],[['RECEP','ping 10.10.1.20']],[['CAP','parar'],['CAP','sel:icmp8']],[['CAP','filtro:icmp']],[['CAP','gravar:RECEP'],['RECEP','tnc 10.10.1.20 -port 443'],['CAP','parar'],['CAP','filtro:tcp']]],
 'a-cap2':[[['CAP','gravar:RECEP'],['RECEP','arp -d'],['RECEP','ping 10.10.1.20']],[['CAP','parar'],['CAP','filtro:arp']],[['RECEP','netsh interface ip set address "Ethernet" static 10.10.20.87 255.255.255.0 10.10.20.254'],['CAP','gravar:RECEP'],['RECEP','ping 10.10.1.20'],['CAP','parar'],['CAP','filtro:arp']],[['RECEP','netsh interface ip set address "Ethernet" dhcp'],['RECEP','ping 10.10.1.20']]],
 'a-cap3':[[['CAP','gravar:FAT'],['FAT','ipconfig /release'],['FAT','ipconfig /renew']],[['CAP','parar'],['CAP','filtro:dhcp'],['CAP','sel:dhcp2']],[['SW1A','enable'],['SW1A','configure terminal'],['SW1A','interface gi1/0/6'],['SW1A','switchport access vlan 99'],['CAP','gravar:FAT'],['FAT','ipconfig /renew']],[['CAP','parar'],['SW1A','switchport access vlan 10'],['FAT','ipconfig /renew']]],
 'a-cap4':[[['CAP','gravar:LAUDO'],['LAUDO','nslookup pacs.hvc.local'],['CAP','parar'],['CAP','filtro:dns']],[['CAP','gravar:LAUDO'],['LAUDO','nslookup naoexiste.hvc.local'],['CAP','parar'],['CAP','filtro:dns']],[['CAP','gravar:WAN'],['LAUDO','nslookup google.com'],['CAP','parar'],['CAP','filtro:dns']]]};
function acao(st,dev,c){if(dev!=='CAP'){const R=CLI.executar(st,dev,c);return{dev,cmd:c.trim().toLowerCase(),R,st,bad:R.linhas.filter(l=>l[0]==='bad')}}
  const[a,arg]=c.split(':');st.relogio=(st.relogio||0)+2;
  if(a==='gravar'){K.iniciar(st,K.pontoDe(st,arg));return{dev,cmd:'gravar',st,bad:[]}}
  if(a==='parar'){K.parar(st);return{dev,cmd:'parar',st,bad:[]}}
  if(a==='filtro'){const r=K.compilar(arg);return{dev,cmd:'filtro',R:arg,st,bad:r.ok?[]:[r.erro]}}
  if(a==='sel'){const f=st.cap.frames.find(f=>arg==='icmp8'?f.l4&&f.l4.icmp&&f.l4.icmp.t===8:f.l4&&f.l4.dhcp&&f.l4.dhcp.t===2);return{dev,cmd:'sel',R:f,st,bad:f?[]:['quadro não achado']}}}
let f=0;
for(const a of AULAS){const st=M.criarRede();const passos=a.passos.filter(p=>p.ok);const rot=ROTEIRO[a.id];
  if(!rot||rot.length!==passos.length){console.log('✗ roteiro',a.id);f++;continue}
  passos.forEach((p,i)=>{let ok=false;for(const[dev,c]of rot[i]){const x=acao(st,dev,c);if(x.bad.length)console.log('  aviso',a.id,c,x.bad);if(p.ok(x))ok=true}
    if(!ok){console.log(`✗ ${a.id} passo ${i+1} não concluiu`);f++}});
  if(!['a-gw','a-dns','a-sw','a-vlan','a-cap2','a-cap3'].includes(a.id)||M.validar(st,{defeitos:[]}).length===0);else{console.log('✗ rede ficou quebrada',a.id,M.validar(st,{defeitos:[]}));f++}}
console.log(f?f+' falha(s)':'Aulas ok.');process.exit(f?1:0);
