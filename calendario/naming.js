/* Luis Montañez Escobar */
'use strict';
((root)=>{
  function filename(s,extension){
    const codes=s.entities?.length?s.entities:(s.entity?[s.entity]:[]),local=[...new Set(codes.filter(c=>c!=='FED'))].sort();
    let suffix=local.length?(local.length===1?local[0]:String(local.length)):(codes.includes('FED')?'FED':'Nacional');
    if(local.length&&codes.includes('FED'))suffix+='_FED';
    let period=s.period==='month'?s.month:'2026-2027';
    if(s.period==='selected'){const months=[...new Set(s.months)].sort(),years=[...new Set(months.map(m=>m.slice(0,4)))];period=months.length===1?months[0]:years.join('-')+'_'+months.length+'meses';}
    const parts=['Calendario',period];
    return [...parts,suffix].join('_')+'.'+extension.toLowerCase();
  }
  root.calendarFilename=filename;
  if(typeof module!=='undefined')module.exports=filename;
})(globalThis);
