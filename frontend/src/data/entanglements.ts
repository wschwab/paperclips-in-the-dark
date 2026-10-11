/**
 * Entanglement table and descriptions, transcribed from the Blades in the Dark SRD
 * (https://bladesinthedark.com/entanglements, CC-BY). Wording is the SRD's; only markdown
 * emphasis is removed. Heat bands are 0–3, 4–5 and 6+ (the SRD's "Heat 6" column and above).
 */

export const ENTANGLEMENTS_SRD_URL = "https://bladesinthedark.com/entanglements";

export const ENTANGLEMENT_BANDS = [
  { label: "0–3", min: 0, max: 3 },
  { label: "4–5", min: 4, max: 5 },
  { label: "6+", min: 6, max: Number.POSITIVE_INFINITY },
] as const;

export type EntanglementBandLabel = (typeof ENTANGLEMENT_BANDS)[number]["label"];

/** Result rows (1–3, 4–5, 6) and, per heat band, the entanglement each result selects. */
export const ENTANGLEMENT_ROWS: ReadonlyArray<{ result: string; outcomes: Record<EntanglementBandLabel, string> }> = [
  { result: "1–3", outcomes: { "0–3": "Gang Trouble or The Usual Suspects", "4–5": "Gang Trouble or Questioning", "6+": "Flipped or Interrogation" } },
  { result: "4–5", outcomes: { "0–3": "Rivals or Unquiet Dead", "4–5": "Reprisals or Unquiet Dead", "6+": "Demonic Notice or Show of Force" } },
  { result: "6", outcomes: { "0–3": "Cooperation", "4–5": "Show of Force", "6+": "Arrest" } },
];

/** SRD description of each entanglement (the main paragraph; the SRD's example quotes are omitted). */
export const ENTANGLEMENT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "Arrest":
    "An Inspector presents a case file of evidence to a magistrate, to begin prosecution of your crew. They send a detail to arrest you (a gang at least equal in scale to your wanted level). Pay them off with coin equal to your wanted level +3, hand someone over for arrest (this clears your heat), or try to evade capture.",
  "Cooperation":
    "A +3 status faction asks you for a favor. Agree to do it, or forfeit 1 rep per Tier of the friendly faction, or lose 1 status with them. If you don’t have a +3 faction status, you avoid entanglements right now.",
  "Demonic Notice":
    "A demon approaches the crew with a dark offer. Accept their bargain, hide until it loses interest (forfeit 3 rep), or deal with it another way.",
  "Flipped":
    "One of the PCs’ rivals arranges for one of your contacts, patrons, clients, or a group of your customers to switch allegiances due to the heat on you. They’re loyal to another faction now.",
  "Gang Trouble":
    "One of your gangs (or other cohorts) causes trouble due to their flaw(s). You can lose face (forfeit rep equal to your Tier +1), make an example of one of the gang members, or face reprisals from the wronged party.",
  "Interrogation":
    "The officers round up one of the PCs to question them about the crew’s crimes. How did they manage to capture you? Either pay them off with 3 coin, or they beat you up (level 2 harm) and you tell them what they want to know (+3 heat). You can resist each of those consequences separately.",
  "Questioning":
    "The cops grab an NPC member of your crew or one of the crew’s contacts, to question them about your crimes. Who do they think is most vulnerable? Make a fortune roll to see how much they talk (1-3: +2 heat, 4/5: +1 heat), or pay the constables off with 2 coin.",
  "Reprisals":
    "An enemy faction makes a move against you (or a friend, contact, or vice purveyor). Pay them (1 rep and 1 coin) per Tier of the enemy as an apology, allow them to mess with you or yours, or fight back and show them who’s boss.",
  "Rivals":
    "A neutral faction throws their weight around. They threaten you, a friend, a contact, or one of your vice purveyors. Forfeit (1 rep or 1 coin) per Tier of the rival, or stand up to them and lose 1 status with them.",
  "Show of Force":
    "A faction with whom you have a negative status makes a play against your holdings. Give them 1 claim or go to war (drop to -3 status). If you have no claims, lose 1 hold instead.",
  "The Usual Suspects":
    "The cops grab someone in the periphery of your crew. One player volunteers a friend or vice purveyor as the person most likely to be taken. Make a fortune roll to find out if they resist questioning (1-3: +2 heat, 4/5: level 2 harm), or pay them off with 1 coin.",
  "Unquiet Dead":
    "A rogue spirit is drawn to you—perhaps it’s a past victim? Acquire the services of an occultist to attempt to destroy or banish it, or deal with it yourself.",
};

/** The five entanglements a heat band can select, in table order (each name appears once). */
export function entanglementsInBand(label: EntanglementBandLabel): string[] {
  const names: string[] = [];
  for (const row of ENTANGLEMENT_ROWS) {
    for (const name of row.outcomes[label].split(" or ")) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}
