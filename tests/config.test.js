import {describe,it,expect} from 'vitest';
import {validateConfig} from '../src/cloud';
describe('safe browser configuration',()=>{
it('accepts public publishable keys',()=>expect(validateConfig({url:'https://test.supabase.co',key:'sb_publishable_example'}).url).toBe('https://test.supabase.co'));
it('rejects secrets and unsafe URLs',()=>{expect(()=>validateConfig({url:'https://test.supabase.co',key:'sb_secret_example'})).toThrow();expect(()=>validateConfig({url:'http://example.com',key:'sb_publishable_example'})).toThrow()});
it('rejects service-role JWTs',()=>{const payload=btoa(JSON.stringify({role:'service_role'}));expect(()=>validateConfig({url:'https://test.supabase.co',key:'eyJ.'+payload+'.x'})).toThrow()});
});
