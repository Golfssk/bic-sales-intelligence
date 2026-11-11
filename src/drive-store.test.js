import { describe, it, expect, vi } from "vitest";
import {
  DRIVE_ACTIVE_NAME, DRIVE_SOURCE_PREFIX,
  DRIVE_SNAPSHOT_FORMAT, summarizeActiveFiles,
  validateSalesSnapshot, DriveSalesStore
} from "./drive-store.js";

const row = Object.freeze({date:"2026-11-01",doc:"ABC123",status:"N",qty:1,inc:100,ex:93.46});

describe("Google Drive single source of truth",()=>{
  it("chooses one latest manifest instead of summing old snapshots",()=>{
    const found = summarizeActiveFiles([
      {name:DRIVE_ACTIVE_NAME,id:"old",modifiedTime:"2026-11-01T00:00:00Z"},
      {name:DRIVE_ACTIVE_NAME,id:"new",modifiedTime:"2026-11-02T00:00:00Z"},
      {name:DRIVE_SOURCE_PREFIX+"2026-11-02-b7a3.xlsx",id:"excel",modifiedTime:"2026-11-02T00:00:00Z"},
      {name:"unrelated.csv",id:"skip"}
    ]);
    expect(found.active.id).toBe("new");
    expect(found.sources.map(f=>f.id)).toEqual(["excel"]);
  });
  it("rejects incomplete or tampered dashboard data",()=>{
    const good={format:DRIVE_SNAPSHOT_FORMAT,rows:[row],rowCount:1};
    expect(validateSalesSnapshot(good)).toBe(good);
    expect(()=>validateSalesSnapshot({...good,rowCount:2})).toThrow();
    expect(()=>validateSalesSnapshot({...good,rows:[{...row,status:"X"}]})).toThrow();
    expect(()=>validateSalesSnapshot({...good,rows:[{...row,inc:NaN}]})).toThrow();
  });
  it("uploads the Excel before publishing the new manifest",async()=>{
    const store=new DriveSalesStore("fake-token");
    vi.spyOn(store,"verifyFolder").mockResolvedValue({id:store.folderId});
    vi.spyOn(store,"listFiles").mockResolvedValue([]);
    const upload=vi.spyOn(store,"uploadBlob")
      .mockResolvedValueOnce({id:"source-id"})
      .mockResolvedValueOnce({id:"active-id"});
    const original=new Blob(["file"],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    Object.defineProperty(original,"name",{value:"sales.xlsx"});
    const result=await store.replaceWithFile({
      source:"sales.xlsx",rows:[row],issues:{},schema:{}
    },original);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][1]).toMatch(/^BIC_SALES_SOURCE_.+\.xlsx$/);
    expect(upload.mock.calls[1][1]).toBe(DRIVE_ACTIVE_NAME);
    const payload=JSON.parse(await upload.mock.calls[1][0].text());
    expect(payload.rowCount).toBe(1);
    expect(payload.sourceFileId).toBe("source-id");
    expect(result.snapshot.rows).toEqual([row]);
  });
  it("never publishes a new manifest if the original Excel upload fails",async()=>{
    const store=new DriveSalesStore("fake-token");
    vi.spyOn(store,"verifyFolder").mockResolvedValue({});
    vi.spyOn(store,"listFiles").mockResolvedValue([]);
    const upload=vi.spyOn(store,"uploadBlob").mockRejectedValueOnce(new Error("Drive quota"));
    const file=new Blob(["x"]);Object.defineProperty(file,"name",{value:"sales.xlsx"});
    await expect(store.replaceWithFile({source:"sales.xlsx",rows:[row]},file)).rejects.toThrow("Drive quota");
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
