import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const write = (p, value) => fs.writeFileSync(new URL(p, import.meta.url), value);
const raw = JSON.parse(read('data/countries.json'));
const names = new Intl.DisplayNames(['sk'], {type:'region'});
const countries = raw.filter(c => c.unMember).map(c => ({
 ...c, sk: names.of(c.cca2), source: 'https://github.com/mledoze/countries/blob/master/data/'+c.cca3.toLowerCase()+'.json'
}));
const local = {'Vienna':'Viedeň','Warsaw':'Varšava','Prague':'Praha','Rome':'Rím','London':'Londýn','Paris':'Paríž','Athens':'Atény','Copenhagen':'Kodaň','Stockholm':'Štokholm','Beijing':'Peking','Tokyo':'Tokio','Seoul':'Soul','Cairo':'Káhira','Lisbon':'Lisabon','Moscow':'Moskva','Bucharest':'Bukurešť','Budapest':'Budapešť','Berlin':'Berlín','Kyiv':'Kyjev','Madrid':'Madrid','Brussels':'Brusel','Bern':'Bern','Dublin':'Dublin','Reykjavik':'Reykjavík','Mexico City':'Mexiko','New Delhi':'Naí Dillí','Brasilia':'Brazília','Havana':'Havana'};
const excluded = new Set(['ID','GQ','IL','PS','ZA','LK','BO','NL','SZ','BJ','CI','TZ','CH','NR','YE','SD']);
const capitals = countries.filter(c => c.capital.length===1 && !excluded.has(c.cca2)).map(c=>({...c, city:local[c.capital[0]] || c.capital[0]}));
const questions = [];
function add(topic, prompt, answer, pool, source, image=null, focus=2){
 const options = [answer,...[...new Set(pool)].filter(v=>v!==answer).slice(0,3)];
 if(options.length!==4) throw Error(prompt);
 questions.push({id:questions.length+1,topic,prompt,answer,options,source,image,tier:focus});
}
const byCode = new Map(countries.map(c=>[c.cca3,c]));
const known = new Set('SK CZ AT HU PL DE FR GB IT ES PT GR UA RU US CA BR AR JP CN IN AU NZ EG ZA NO SE FI DK IS IE CH BE NL HR TR MX KR'.split(' '));
const region = {Africa:'Afrika',Americas:'Amerika',Asia:'Ázia',Europe:'Európa',Oceania:'Oceánia'};
const tier = c => known.has(c.cca2)?1:c.area>=100000?2:3;
const offset = (list,i)=>[...list.slice(i%list.length),...list.slice(0,i%list.length)];
for(const [i,c] of capitals.entries()){
 const others=offset(capitals,i*13);
 const comparable=[...others.filter(x=>x.region===c.region),...others];
 add('Hlavné mestá', 'Aké hlavné mesto má štát '+c.sk+'?',c.city,comparable.map(x=>x.city),c.source,null,tier(c));
 add('Hlavné mestá','Ktorý štát má hlavné mesto '+c.city+'?',c.sk,comparable.filter(x=>x.city!==c.city).map(x=>x.sk),c.source,null,tier(c));
}
for(const [i,c] of countries.entries()){
 const others=offset(countries,i*19);
 const nearby=[...others.filter(x=>x.region===c.region),...others];
 add('Vlajky','Ktorému štátu patrí táto vlajka?',c.sk,nearby.map(x=>x.sk),c.source,c.cca2.toLowerCase(),tier(c));
 add('Štáty','Do ktorého svetadielu radí zdroj OSN štát '+c.sk+'?',region[c.region],offset(Object.values(region),i), 'https://github.com/mledoze/countries',null,tier(c));
 const neighbors=c.borders.map(code=>byCode.get(code)).filter(Boolean);
 if(neighbors.length){
   const other=neighbors[i%neighbors.length];
   add('Štáty','Ktorý z uvedených štátov má pozemnú hranicu so štátom '+c.sk+'?',other.sk,nearby.filter(x=>x!==c&&!c.borders.includes(x.cca3)).map(x=>x.sk),c.source,null,Math.min(3,tier(c)+1));
 }
}
for(const [i,line] of read('data/features.txt').trim().split(/\r?\n/).entries()){
 const [topic,country,places]=line.split('|');
 for(const entry of places.split(',')){
 const [place,slug]=entry.split(';');
 add(topic,'Ku ktorému štátu patrí '+place+'?',country,offset(countries,i*17).map(c=>c.sk),'https://www.britannica.com/place/'+slug,null,i%3+1);
 }
}
for(const [i,c] of countries.entries()){
 if(questions.length>=1000) break;
 const comparable=offset(countries,i*23).filter(x=>x!==c&&x.area<c.area*0.55&&x.area>0);
 if(comparable.length<3) continue;
 add('Štáty','Ktorý z uvedených štátov má najväčšiu rozlohu? ('+(i+1)+')',c.sk,comparable.map(x=>x.sk),c.source,null,2+i%2);
}
if(questions.length!==1000) throw Error('Počet otázok: '+questions.length);
// Name the comparison set so that text stays unique and describes the actual question.
for(const q of questions){
 if(q.prompt.startsWith('Ktorý z uvedených štátov má najväčšiu rozlohu?')){
   q.prompt='Ktorý štát má najväčšiu rozlohu? '+[...q.options].sort((a,b)=>a.localeCompare(b,'sk')).join(' · ');
 }
 if(q.prompt.startsWith('Do ktorého')) q.prompt=q.prompt.replace('zdroj OSN','geografické členenie');
}
const flagCodes=questions.filter(q=>q.image).map(q=>q.image);
const assetIds = Object.fromEntries(flagCodes.map((code,i)=>[code,'f'+String((i*73)%197).padStart(3,'0')]));
for(const q of questions) if(q.image) q.image=assetIds[q.image];
write('site/questions.js','globalThis.DEMO_QUESTIONS = '+JSON.stringify(questions)+';\n');
write('data/flag-map.json',JSON.stringify(assetIds,null,2));
write('supabase/migrations/20261113000200_questions.sql',
 'insert into private.quiz_questions (id, topic, prompt, answer, options, source, image, tier) values\n'+
 questions.map(q=>'('+[q.id,q.topic,q.prompt,q.answer,q.options,q.source,q.image,q.tier].map(v=>
 v===null?'null':typeof v==='number'?v:"'"+(Array.isArray(v)?JSON.stringify(v):v).replaceAll("'","''")+"'").join(',')+')').join(',\n')+';\n');
console.log(Object.fromEntries([...new Set(questions.map(q=>q.topic))].map(t=>[t,questions.filter(q=>q.topic===t).length])));
