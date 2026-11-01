const KEY='bic-appearance';
const root=document.documentElement;
function initialTheme(){try{return localStorage.getItem(KEY)==='light'?'light':'dark'}catch{return 'dark'}}
function applyTheme(theme){root.dataset.appearance=theme;root.style.colorScheme=theme;const button=document.getElementById('appearanceToggle');if(button){button.textContent=theme==='dark'?'☀ Light mode':'☾ Dark mode';button.setAttribute('aria-label',theme==='dark'?'Switch to light appearance':'Switch to dark appearance');button.setAttribute('aria-pressed',String(theme==='light'))}}
applyTheme(initialTheme());
function mountToggle(){if(document.getElementById('appearanceToggle'))return;const button=document.createElement('button');button.type='button';button.id='appearanceToggle';button.className='appearance-toggle';button.addEventListener('click',()=>{const next=root.dataset.appearance==='dark'?'light':'dark';applyTheme(next);try{localStorage.setItem(KEY,next)}catch{}});document.body.appendChild(button);applyTheme(root.dataset.appearance)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountToggle,{once:true});else mountToggle();
