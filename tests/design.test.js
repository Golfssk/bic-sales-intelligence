import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHART_THEME, GROUP_PALETTE } from '../src/visual-tokens.js';
const css=readFileSync(new URL('../src/spotify.css',import.meta.url),'utf8');
const tokens=Object.fromEntries([...css.slice(0,css.indexOf('body.ux-workbench')).matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(m=>[m[1],m[2]]));
const lum=hex=>hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
describe('Spotify-inspired presentation',()=>{
 it('uses the supplied near-black surfaces and functional green accent',()=>{
  expect(tokens.canvas).toBe('#121212');expect(tokens.surface).toBe('#181818');expect(tokens.brand).toBe('#1ed760');expect(tokens.card).toBe('#252525');expect(tokens.ink).toBe('#ffffff');
  expect(readFileSync(new URL('../src/main.js',import.meta.url),'utf8')).toContain("import './spotify.css'");
  expect(css).not.toContain('color:#000!important');
 });
 it('keeps body, secondary text and semantic states readable across dark surfaces',()=>{
  for(const color of ['ink','body','muted','red','green'])for(const surface of ['canvas','surface','card'])expect(contrast(tokens[color],tokens[surface]),`${color}/${surface}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#000000',tokens.brand)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(CHART_THEME.onTooltip,CHART_THEME.tooltip)).toBeGreaterThanOrEqual(4.5);
 });
 it('gives analytical strokes visible contrast and retains distinct categorical colors',()=>{
  for(const key of ['primary','positive','negative','secondary'])expect(contrast(CHART_THEME[key],tokens.surface),key).toBeGreaterThanOrEqual(3);
  for(const color of GROUP_PALETTE)expect(contrast(color,tokens.surface),color).toBeGreaterThanOrEqual(3);
  expect(GROUP_PALETTE).toHaveLength(8);expect(new Set(GROUP_PALETTE).size).toBe(8);expect(CHART_THEME.surface).toBe(tokens.surface);
 });
 it('uses fallback fonts, dark native controls, touch pills and valid colors',()=>{
  expect(css).toContain("'Helvetica Neue',Arial,Thai,sans-serif");expect(css).toContain('color-scheme:dark');expect(css).toContain('border-radius:9999px');expect(css).toContain('prefers-reduced-motion');expect(CHART_THEME.text).toBe('#b3b3b3');expect(CHART_THEME.onTooltip).toBe('#ffffff');expect(css).not.toMatch(/https?:\/\//);
  for(const c of css.match(/#[\da-f]+\b/gi)||[])expect([3,4,6,8]).toContain(c.length-1);
 });
});
