import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHART_THEME, GROUP_PALETTE } from '../src/visual-tokens.js';
const css=readFileSync(new URL('../src/claude.css',import.meta.url),'utf8');
const tokens=Object.fromEntries([...css.slice(0,css.indexOf('body.ux-workbench')).matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(m=>[m[1],m[2]]));
const lum=hex=>hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
describe('Warm editorial presentation',()=>{
 it('uses the supplied warm canvas/coral/card tokens, not the former dark/green floor',()=>{
  expect(tokens.canvas).toBe('#faf9f5');expect(tokens.coral).toBe('#cc785c');expect(tokens.card).toBe('#efe9de');expect(tokens.ink).toBe('#141413');
 });
 it('keeps running text, secondary text and semantic states readable on their surfaces',()=>{
  for(const color of ['ink','body','muted','red','green'])expect(contrast(tokens[color],tokens.canvas),color).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens['accent-text'],tokens.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#241b16',tokens.coral)).toBeGreaterThanOrEqual(4.5);
 });
 it('gives analytical strokes visible contrast and retains distinct categorical colors',()=>{
  for(const key of ['primary','positive','negative','secondary'])expect(contrast(CHART_THEME[key],tokens.canvas),key).toBeGreaterThanOrEqual(3);
  expect(GROUP_PALETTE).toHaveLength(8);expect(new Set(GROUP_PALETTE).size).toBe(8);expect(CHART_THEME.surface).toBe(tokens.canvas);
 });
 it('uses locally available fallback fonts and keeps native controls in light mode',()=>{
  expect(css).toContain("Georgia,'Times New Roman',Thai,serif");expect(css).toContain('color-scheme:light');expect(css).not.toMatch(/https?:\/\//);
 });
});
