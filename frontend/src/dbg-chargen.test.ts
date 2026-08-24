// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mountCharacterCreatePage } from "./pages/character-create.js";

describe("dbg", () => {
  it("probe", () => {
    const root = document.createElement("div");
    const SETTINGS = {
      Name: "B", StressMax: 9, StartingActionDots: 7, StartingActionDotMax: 2,
      Attributes: [
        { Name: "Insight", Actions: [{Name:"Hunt"},{Name:"Study"},{Name:"Survey"},{Name:"Tinker"}] },
        { Name: "Prowess", Actions: [{Name:"Finesse"},{Name:"Prowl"},{Name:"Skirmish"},{Name:"Wreck"}] },
        { Name: "Resolve", Actions: [{Name:"Attune"},{Name:"Command"},{Name:"Consort"},{Name:"Sway"}] },
      ],
    };
    mountCharacterCreatePage(root, { gameStem:"b", playbooks:["Cutter"], settings:SETTINGS as any, crewTypes:[], onCreated:()=>{}, onCrewCreated:()=>{} });
    const click = (label:string)=>{const b=root.querySelector<HTMLButtonElement>(`.pc-chargen-form button[aria-label="${label}"]`)!; if(!b) throw new Error("missing "+label); b.click();};
    click("Hunt 2"); click("Study 2"); click("Survey 2"); click("Tinker 1");
    const states = [...root.querySelectorAll(".pc-chargen-form .action-dots")].map(d=>d.getAttribute("aria-label"));
    console.log(JSON.stringify(states));
    expect(1).toBe(1);
  });
});
