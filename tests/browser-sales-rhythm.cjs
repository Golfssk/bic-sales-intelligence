// Sales Rhythm month/quarter regression test; all records are synthetic.
const {chromium}=require('playwright');
const assert=require('assert');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||require('child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_BASE_URL||'http://localhost:4174');
  await page.waitForFunction(()=>window.BIC_APP&&window.BIC_TEST);
  const csv=[
   'วันที่เอกสาร,วันที่สร้างข้อมูล,เลขที่เอกสาร,ร้านค้า,ชื่อร้านค้า,สินค้า,ชื่อสินค้า,หน่วย,คืนสินค้า,จำนวน,มูลค่าขาย,มูลค่าขายรวม Vat.,มูลค่าส่วนลด,มูลค่าขายก่อนส่วนลด,มูลค่า VAT',
   '03/10/2026,03/10/2026 10:00:00,OCT,01,QA,001,QA product,CUP,N,1,100,107,0,100,7',
   '03/11/2026,03/11/2026 10:00:00,NOV,01,QA,001,QA product,CUP,N,1,200,214,0,200,14',
   '03/01/2027,03/01/2027 10:00:00,JAN,01,QA,001,QA product,CUP,N,1,300,321,0,300,21',
   '03/04/2027,03/04/2027 10:00:00,APR,01,QA,001,QA product,CUP,N,1,400,428,0,400,28'
  ].join('\\n');
  await page.setInputFiles('#file',{name:'sales-rhythm-qa.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForFunction(()=>BIC_APP.getData().rows.length===4);
  await page.locator('#period').selectOption('monthly');
  let buckets=await page.evaluate(()=>BIC_TEST.getState().chartBuckets.map(b=>({key:b.key,sales:b.s?.sales??null})));
  assert.deepStrictEqual(buckets,[{key:'2026-10',sales:107},{key:'2026-11',sales:214},{key:'2026-12',sales:null},{key:'2027-01',sales:321},{key:'2027-02',sales:null},{key:'2027-03',sales:null},{key:'2027-04',sales:428}]);
  await page.locator('#period').selectOption('quarterly');
  buckets=await page.evaluate(()=>BIC_TEST.getState().chartBuckets.map(b=>({key:b.key,sales:b.s?.sales??null})));
  assert.deepStrictEqual(buckets,[{key:'2026-Q4',sales:321},{key:'2027-Q1',sales:321},{key:'2027-Q2',sales:428}]);
  assert.deepStrictEqual(errors,[]);
  console.log('Sales Rhythm monthly/quarterly totals, empty periods and year boundaries PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
