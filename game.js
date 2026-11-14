(() => {
const levels = ['Začiatočník','Učenec','Dobrodruh','Znalec','Expert','Majster'];
const thresholds = [0,500,1200,2000,2750,3500];
const modes = [
 {name:'Ľahká',count:10,value:10,icon:'◈',style:'easy',hint:'Začni známymi miestami.'},
 {name:'Ťažšia',count:15,value:10,icon:'✦',style:'medium',hint:'Zamier aj mimo známych máp.'},
 {name:'Najťažšia',count:20,value:12,icon:'✺',style:'hard',hint:'Preskúmaj odľahlé kúty sveta.'}
];
const avatars = [...'🦁🐯🐻🐼🦊🐺🐨🐸🐵🐱🐶🐰🐮🐷🦉🐧🐢🐙🦋🐬'];
function shuffle(list) {
 const copy = [...list];
 for(let i=copy.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [copy[i],copy[j]]=[copy[j],copy[i]];
 }
 return copy;
}
function select(bank,level,difficulty) {
 const target=Math.min(3,1+(difficulty-1)*0.65+(level-1)*0.15);
 const ranked=bank.map(q=>({q,weight:Math.random()*2-Math.abs(q.tier-target)}));
 ranked.sort((a,b)=>b.weight-a.weight);
 return shuffle(ranked.slice(0,modes[difficulty-1].count)).map(({q})=>({...q,options:shuffle(q.options)}));
}
function grade(profile,difficulty,questions,answers) {
 if(answers.length!==questions.length || questions.some((q,i)=>!q.options.includes(answers[i]))) throw Error('Vyplň všetky odpovede.');
 const review=questions.map((q,i)=>({...q,selected:answers[i]}));
 const correct=review.filter(q=>q.answer===q.selected).length;
 const earned=correct*modes[difficulty-1].value;
 let {level,points}=profile;
 points+=earned;
 if(level<6 && points>=thresholds[level]){
  level++;
  points=0;
 }
 return {date:new Date().toISOString(),difficulty,correct,total:questions.length,earned,previous:profile.level,level,points,review};
}
globalThis.Quiz = {levels,thresholds,modes,avatars,select,grade};
})();