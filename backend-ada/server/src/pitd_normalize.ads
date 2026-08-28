--  ARCH-01 rev 2: normalization / preview.  Extracted verbatim from
--  pitd_callback.adb (finding AR-014); no behavioral change.  The SC-A1
--  canonicalizer (R0 matrix), the import-needs resolution, settings-maxima
--  admission issues, the RFC 6901 pointer utilities, the preview-token
--  store, and the change-list interpretation helpers.
with Ada.Calendar;
with Ada.Strings.Unbounded;
with GNATCOLL.JSON;
with Pitd_Common;

package Pitd_Normalize is
   pragma SPARK_Mode (Off);

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;

   --  SC-A1 canonicalizer (R0 matrix: docs/pages/contract/wave0/
   --  canonicalization-matrix.mdx, D1-D10/L1-L8; frozen schemas under
   --  contract/schemas/).  Pure: never writes, never repairs storage.
   --
   --  Classifies a raw stored/submitted entity document into one of the four
   --  normalizer outcomes and, when possible, produces the canonicalized
   --  document plus the ordered change list.  The import/repair preview and
   --  apply transactions (SC-A2) and stored admission (SC-A3) consume this.
   --
   --  Result object fields (JSON):
   --    outcome  "canonical" | "repairable" | "needs-input" | "unreadable"
   --    canonical  boolean (true when zero changes)
   --    document   normalized entity (absent when outcome is unreadable)
   --    changes    ordered array of {pointer, reason, previous, replacement}
   --    warnings   array of human-readable strings
   --    needsInputPointers  array of RFC 6901 pointers awaiting caller values
   --    issues     array of {pointer, reason, expected} (needs-input and
   --                unreadable details, empty for canonical/repairable)
   function Canonicalize
     (Kind, Id : String; Bytes : String) return JSON_Value;
   function Canonicalize
     (Kind, Id : String; V : JSON_Value) return JSON_Value;

   --  SC-A2: re-run needs-input resolution for a stored degraded entity when
   --  the game stem becomes resolvable.
   procedure Resolve_Import_Needs
     (Kind, Id : String; Stored, Entity_V : JSON_Value; R : in out JSON_Value);

   --  SC-A5: settings-bound maxima admission issues for a canonical document.
   function Settings_Maxima_Issues (Kind : String; Doc : JSON_Value) return JSON_Array;

   --  SC-A2: the preview member carried by NORMALIZATION_REQUIRED and by
   --  preview 200 responses.
   function Preview_Result_Value
     (Changes, Warnings, Needs : JSON_Array; Canonical : Boolean;
      Doc : JSON_Value; Token : String := "") return JSON_Value;

   --  SC-A2: opaque preview tokens (import/repair preview -> confirming
   --  apply).  Each token is bound to the route (kind/id), a SHA-256 of the
   --  exact previewed input, the stored revision (or sha256: content token
   --  for a degraded target) at preview time, and the previewed result.
   --  Tokens are single-use and expire after Preview_Token_Lifetime.
   type Preview_Token_Entry is record
      Token      : Unbounded_String := Null_Unbounded_String;
      Kind       : Unbounded_String := Null_Unbounded_String;
      Id         : Unbounded_String := Null_Unbounded_String;
      Input_Hash : Unbounded_String := Null_Unbounded_String;
      Revision   : Integer := -1;             --  stored revision at preview
      Content    : Unbounded_String := Null_Unbounded_String; --  sha256: token when degraded
      Doc        : JSON_Value := JSON_Null;   --  previewed normalized document
      Outcome    : Unbounded_String := Null_Unbounded_String;
      Needs      : JSON_Array := Empty_Array; --  needs-input pointers awaiting caller values
      Issues     : JSON_Array := Empty_Array; --  needs-input issue triples
      Changes    : JSON_Array := Empty_Array;
      Warnings   : JSON_Array := Empty_Array;
      Expires    : Ada.Calendar.Time;
      Used       : Boolean := False;
   end record;

   procedure Preview_Issue
     (Kind, Id, Input_Hash : String; Revision : Integer; Content : String;
      Doc : JSON_Value; Outcome : String;
      Needs, Issues, Changes, Warnings : JSON_Array;
      Token : out Unbounded_String);
   procedure Preview_Redeem
     (Token : String; Found, Used : out Boolean; E : out Preview_Token_Entry);

   --  Change-list interpretation for the INVALID_ENTRY details and the
   --  classified unknown-key removal path.
   function Has_Change_Reason (Changes : JSON_Array; Reason : String) return Boolean;
   function Issues_For_Reason (Changes : JSON_Array; Reason : String) return JSON_Array;

   --  RFC 6901 pointer write used by the import/repair apply path.
   function Set_At_Pointer
     (Doc : JSON_Value; Pointer : String; Value : JSON_Value) return Boolean;

   --  gear.maxBulk derives from the commitment level (C# LoadCommitmentOption).
   function Commitment_Max_Bulk (S : Pitd_Common.Settings_Ref; Commitment : String) return Integer;

   --  True when B contains only the pipe-wrapped allowed field names.
   function Only_Fields (B : JSON_Value; Allowed : String) return Boolean;

   --  Sorted key list of a JSON object (unknown-key disclosure boundary).
   function Collect_Keys (O : JSON_Value) return JSON_Array;
end Pitd_Normalize;
