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
  // Enable quick bulk selection of every connected channel.
  const all=document.querySelector('[data-select-all-channels]');
  all?.addEventListener('change',()=>{
    const form=all.closest('form');
    form?.querySelectorAll('input[name="channels"]:not(:disabled)').forEach(el=>{el.checked=all.checked;});
  });
})();