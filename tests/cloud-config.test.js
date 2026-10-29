import {describe,it,expect} from 'vitest';
import {PROJECT_URL,pickProjectConfig,uploadProblem} from '../src/cloud-config';
const key='sb_publishable_test_only';
describe('Project migration and safe automatic upload',()=>{
 it('pins the requested new project',()=>expect(PROJECT_URL).toBe('https://gknqdodyvejvdlaxucrs.supabase.co'));
 it('ignores obsolete browser settings and deployment env',()=>expect(pickProjectConfig({url:'https://old.supabase.co',key},{url:'https://old.supabase.co',key})).toBeNull());
 it('uses the new project env over obsolete local settings',()=>expect(pickProjectConfig({url:'https://old.supabase.co',key},{url:PROJECT_URL,key})).toEqual({url:PROJECT_URL,key}));
 it('accepts a saved public key only for the pinned project',()=>expect(pickProjectConfig({url:PROJECT_URL,key},null)).toEqual({url:PROJECT_URL,key}));
 it('rejects partial core-data imports',()=>expect(uploadProblem({rows:[{}],issues:{date:1}})).toContain('ไม่แทนชุด Cloud เดิม'));
 it('permits excluded explicit summary rows',()=>expect(uploadProblem({rows:[{}],issues:{summary:1}})).toBeNull());
 it('does not upload demos or empty data',()=>{expect(uploadProblem({isDemo:true,rows:[{}]})).toBeTruthy();expect(uploadProblem({rows:[]})).toBeTruthy()});
 it('enforces row count limit',()=>expect(uploadProblem({rows:Array(25001).fill({})})).toContain('25,000'));
});
describe('Source footer upload gate',()=>{
 it('blocks mismatches rather than replacing the latest Cloud snapshot',()=>expect(uploadProblem({rows:[{inc:107}],schema:{sourceTotals:{inc:214}},issues:{summary:1}})).toContain('ไม่แทนชุด Cloud เดิม'));
 it('permits matching independent footer controls',()=>expect(uploadProblem({rows:[{inc:107}],schema:{sourceTotals:{inc:107}},issues:{summary:1}})).toBeNull());
 it('does not label incomplete optional numeric fields a matching control',()=>expect(uploadProblem({rows:[{disc:null}],schema:{sourceTotals:{disc:0}},issues:{summary:1}})).toContain('ข้อมูลไม่ครบ'));
});
