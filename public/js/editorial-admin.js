(() => {
  'use strict';
  const product=document.querySelector('select[name="product_id"]');
  const article=document.querySelector('select[name="article_id"]');
  const image=document.querySelector('[name="image_url"][data-media-url]');
  const link=document.querySelector('[name="link_path"]');
  function useSelection(source,other){
    const option=source?.selectedOptions?.[0];
    if(!option?.value)return;
    if(other)other.value='';
    if(link&&option.dataset.link)link.value=option.dataset.link;
    if(image&&option.dataset.image){
      image.value=option.dataset.image;
      const field=image.closest('[data-media-field]');
      const preview=field?.querySelector('[data-media-preview]');
      const empty=field?.querySelector('[data-media-empty]');
      if(preview){preview.src=option.dataset.image;preview.hidden=false;}
      if(empty)empty.hidden=true;
    }
  }
  product?.addEventListener('change',()=>useSelection(product,article));
  article?.addEventListener('change',()=>useSelection(article,product));
  // Convert the editorial scheduling control to an unambiguous UTC instant.
  const localSchedule=document.querySelector('[data-publish-local]');
  const utcSchedule=document.querySelector('[data-publish-utc]');
  if(localSchedule&&utcSchedule){
    if(utcSchedule.value){
      const initial=new Date(utcSchedule.value);
      if(!Number.isNaN(initial.valueOf())){
        const n=v=>String(v).padStart(2,'0');
        localSchedule.value=initial.getFullYear()+'-'+n(initial.getMonth()+1)+'-'+n(initial.getDate())+'T'+n(initial.getHours())+':'+n(initial.getMinutes());
      }
    }
    const convert=()=>{utcSchedule.value=localSchedule.value?new Date(localSchedule.value).toISOString():'';};
    localSchedule.addEventListener('change',convert);
    localSchedule.closest('form')?.addEventListener('submit',convert);
  }
  // Live character count for the short (X/Bluesky/Threads) version.
  document.querySelectorAll('[data-char-count]').forEach(field=>{
    const out=document.createElement('small');
    field.insertAdjacentElement('afterend',out);
    const update=()=>{const n=[...field.value].length;out.textContent=n+' characters'+(n>200?' — will be trimmed to fit X with the link':'');};
    field.addEventListener('input',update);update();
  });
  // Enable quick bulk selection of every connected channel.
  const all=document.querySelector('[data-select-all-channels]');
  all?.addEventListener('change',()=>{
    const form=all.closest('form');
    form?.querySelectorAll('input[name="channels"]:not(:disabled)').forEach(el=>{el.checked=all.checked;});
  });
})();