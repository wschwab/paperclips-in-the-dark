with Ada.Strings.Unbounded;
with GNATCOLL.JSON;
with Pitd_Common;
with Pitd_Error;

package body Pitd_Capability is
   pragma SPARK_Mode (Off);

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
   use Pitd_Common;
   use Pitd_Error;

   --  Crew Claims: is Claim_Id a canonical claim of this crew's type?
   --  Reads Game(stem & "-crews") CrewTypes[].Claims.Nodes[].Id.  The Lair
   --  is definition-owned and is NOT claimable via claim.set.
   function Claim_Exists (E : JSON_Value; Claim_Id : String; Is_Lair : out Boolean) return Boolean is
      G : constant JSON_Value := Game (Str_Field (E, "gameStem") & "-crews");
   begin
      Is_Lair := False;
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, "CrewTypes") then
         return False;
      end if;
      declare Types : constant JSON_Array := Get (G, "CrewTypes"); begin
         for I in 1 .. Length (Types) loop
            declare T : constant JSON_Value := Get (Types, I); begin
               if Str_Field (T, "Name") = Str_Field (E, "crewTypeName")
                 and then Has_Field (T, "Claims")
               then
                  declare
                     C    : constant JSON_Value := Get (T, "Claims");
                     Ns   : constant JSON_Array := Get (C, "Nodes");
                  begin
                     for J in 1 .. Length (Ns) loop
                        declare N : constant JSON_Value := Get (Ns, J); begin
                           if Str_Field (N, "Id") = Claim_Id then
                              Is_Lair := Str_Field (N, "Kind", "claim") = "lair";
                              return True;
                           end if;
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      return False;
   end Claim_Exists;

   --  Crew Claims (A15): derived effect evaluation.  Acquired claims carry
   --  typed effects ({Kind, Target, Delta}); only derivedDelta on crew.turf
   --  is currently modeled.  The effective value is BASE + SUM of deltas from
   --  controlled claims — recomputed from base state, never a subtractive
   --  compensation ledger, so clamps/manual edits cannot drift.
   function Turf_Effect_Delta (E : JSON_Value) return Integer is
      Sum : Integer := 0;
      G : constant JSON_Value := Game (Str_Field (E, "gameStem") & "-crews");
      Owned : constant JSON_Array :=
        (if Has_Field (E, "claimedClaimIds") then Get (E, "claimedClaimIds")
         else Empty_Array);
   begin
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, "CrewTypes") then
         return 0;
      end if;
      declare Types : constant JSON_Array := Get (G, "CrewTypes"); begin
         for I in 1 .. Length (Types) loop
            declare T : constant JSON_Value := Get (Types, I); begin
               if Str_Field (T, "Name") = Str_Field (E, "crewTypeName")
                 and then Has_Field (T, "Claims")
               then
                  declare
                     C  : constant JSON_Value := Get (T, "Claims");
                     Ns : constant JSON_Array := Get (C, "Nodes");
                  begin
                     for J in 1 .. Length (Ns) loop
                        declare N : constant JSON_Value := Get (Ns, J); begin
                           if Has_Field (N, "Effects") then
                              declare
                                 Ef : constant JSON_Array := Get (N, "Effects");
                                 Owned_Now : Boolean := False;
                              begin
                                 for K in 1 .. Length (Owned) loop
                                    declare Owned_Id : constant UTF8_String := Get (Get (Owned, K)); begin
                                       if Owned_Id = Str_Field (N, "Id") then
                                          Owned_Now := True; exit;
                                       end if;
                                    end;
                                 end loop;
                                 if Owned_Now then
                                    for K in 1 .. Length (Ef) loop
                                       declare FX : constant JSON_Value := Get (Ef, K); begin
                                          if Str_Field (FX, "Kind") = "derivedDelta"
                                            and then Str_Field (FX, "Target") = "crew.turf"
                                          then
                                             Sum := Sum + Int_Field (FX, "Delta");
                                          end if;
                                       end;
                                    end loop;
                                 end if;
                              end;
                           end if;
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      return Sum;
   end Turf_Effect_Delta;

   --  SC-A5: capability projections (contract/openapi.yaml
   --  CharacterCapabilities / CrewCapabilities).  Advisory only — the
   --  mutation endpoints remain authoritative.  Every limit value is read
   --  from the validated game settings; nothing here is persisted and no
   --  capability literal lives in these functions.
   function Entity_Max_Rating (E : JSON_Value; Action : String) return Integer is
      --  maxRating as stored on the entity for this action; -1 when the
      --  entity has no such action (callers fall back to the settings).
      Attrs : constant JSON_Array := Get (Get (E, "talent"), "attributes");
   begin
      for I in 1 .. Length (Attrs) loop
         declare
            A    : constant JSON_Value := Get (Attrs, I);
            Acts : constant JSON_Array := Get (A, "actions");
         begin
            for J in 1 .. Length (Acts) loop
               declare X : constant JSON_Value := Get (Acts, J); begin
                  if Str_Field (X, "name") = Action then
                     return Int_Field (X, "maxRating", -1);
                  end if;
               end;
            end loop;
         end;
      end loop;
      return -1;
   end Entity_Max_Rating;

   function Has_Ability (E : JSON_Value; Name : String) return Boolean is
      P : constant JSON_Value := Get (E, "playbook");
      A : constant JSON_Array :=
        (if Has_Field (P, "abilities") then Get (P, "abilities")
         else Empty_Array);
   begin
      for I in 1 .. Length (A) loop
         if Str_Field (Get (A, I), "name") = Name then return True; end if;
      end loop;
      return False;
   end Has_Ability;

   function Committed_Bulk (E : JSON_Value) return Integer is
      G   : constant JSON_Value := Get (E, "gear");
      L   : constant JSON_Array := Get (G, "loadout");
      Sum : Integer := 0;
   begin
      for I in 1 .. Length (L) loop
         Sum := Sum + Int_Field (Get (L, I), "bulk", 0);
      end loop;
      return Sum;
   end Committed_Bulk;

   function Upgrade_Marked (E : JSON_Value; Name : String) return Integer is
      U : constant JSON_Array :=
        (if Has_Field (E, "upgrades") then Get (E, "upgrades") else Empty_Array);
   begin
      for I in 1 .. Length (U) loop
         if Str_Field (Get (U, I), "name") = Name then
            return Int_Field (Get (U, I), "boxesMarked", 0);
         end if;
      end loop;
      return 0;
   end Upgrade_Marked;

   function Ability_Taken (E : JSON_Value; Name : String) return Integer is
      A : constant JSON_Array :=
        (if Has_Field (E, "specialAbilities") then Get (E, "specialAbilities")
         else Empty_Array);
   begin
      for I in 1 .. Length (A) loop
         if Str_Field (Get (A, I), "name") = Name then
            return Int_Field (Get (A, I), "timesTaken", 0);
         end if;
      end loop;
      return 0;
   end Ability_Taken;

   function Character_Capabilities (E : JSON_Value) return JSON_Value is
      G       : constant JSON_Value := Game (Str_Field (E, "gameStem"));
      X       : JSON_Value := Create_Object;
      Out_A   : JSON_Array := Empty_Array;
      Total   : Integer := 0;
      Marked  : Integer := 0;
      Committed : Integer := 0;
      Mule_Raise : Integer := 0;
   begin
      --  An entity whose game settings cannot be resolved has no capability
      --  projection; the caller maps this to 422 INVALID_ENTITY.
      if G.Kind /= JSON_Object_Type then return JSON_Null; end if;
      Set_Field (X, "characterId", Str_Field (E, "id"));
      Mastery_State (E, Total, Marked);
      declare
         Base_Cap    : constant Integer := Int_Field (Get (G, "ActionCap"), "Base", 0);
         Mastery_Cap : constant Integer := Int_Field (Get (G, "ActionCap"), "Mastery", 0);
         Cap         : constant Integer :=
           (if Total > 0 and then Marked >= Total then Mastery_Cap else Base_Cap);
         Attrs       : constant JSON_Array := Get (G, "Attributes");
      begin
         for I in 1 .. Length (Attrs) loop
            declare A0 : constant JSON_Value := Get (Attrs, I); begin
               if Has_Field (A0, "Actions") then
                  declare
                     Acts : constant JSON_Array := Get (A0, "Actions");
                  begin
                     for J in 1 .. Length (Acts) loop
                        declare
                           Item      : JSON_Value := Create_Object;
                           Name      : constant String := Str_Field (Get (Acts, J), "Name");
                           Max_Rating : Integer := Entity_Max_Rating (E, Name);
                        begin
                           if Max_Rating < 0 then
                              Max_Rating := Int_Field (G, "ActionPointMaximum", 0);
                           end if;
                           Set_Field (Item, "action", Name);
                           Set_Field (Item, "maxRating", Max_Rating);
                           Set_Field (Item, "effectiveMax",
                                      Integer'Min (Max_Rating, Cap));
                           Set_Field (Item, "masteryTotalBoxes", Total);
                           Set_Field (Item, "masteryMarkedBoxes", Marked);
                           Append (Out_A, Item);
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      Set_Field (X, "effectiveActionCaps", Out_A);
      declare
         H      : constant JSON_Value := Get (Get (E, "monitor"), "harm");
         HC     : constant JSON_Value := Get (G, "HarmCapacities");
         Levels : constant Level_Array :=
           (To_Unbounded_String ("lesser"), To_Unbounded_String ("moderate"),
            To_Unbounded_String ("severe"), To_Unbounded_String ("fatal"));
         Cap_Keys : constant Level_Array :=
           (To_Unbounded_String ("Lesser"), To_Unbounded_String ("Moderate"),
            To_Unbounded_String ("Severe"), To_Unbounded_String ("Fatal"));
         HA : JSON_Array := Empty_Array;
      begin
         for I in Levels'Range loop
            declare
               Item     : JSON_Value := Create_Object;
               Slot     : constant JSON_Array := Get (H, To_String (Levels (I)));
               Capacity : constant Integer := Int_Field (HC, To_String (Cap_Keys (I)), 0);
            begin
               Set_Field (Item, "level", To_String (Levels (I)));
               Set_Field (Item, "capacity", Capacity);
               Set_Field (Item, "remaining", Capacity - Integer (Length (Slot)));
               Append (HA, Item);
            end;
         end loop;
         Set_Field (X, "harmCapacities", HA);
      end;
      declare
         LM      : constant JSON_Value := Get (G, "LoadMaxima");
         CMB     : constant JSON_Value := Get (LM, "CommitmentMaxBulk");
         Options : constant Level_Array :=
           (To_Unbounded_String ("none"), To_Unbounded_String ("light"),
            To_Unbounded_String ("normal"), To_Unbounded_String ("heavy"),
            To_Unbounded_String ("encumbered"));
         Opt_Keys : constant Level_Array :=
           (To_Unbounded_String ("none"), To_Unbounded_String ("Light"),
            To_Unbounded_String ("Normal"), To_Unbounded_String ("Heavy"),
            To_Unbounded_String ("Encumbered"));
         LA : JSON_Array := Empty_Array;
      begin
         Committed := Committed_Bulk (E);
         --  Mule (Blades Cutter) raises Light/Normal/Heavy by 2; the frozen
         --  loadLimits schema folds the raise into remainingBulk.
         if Has_Ability (E, "Mule") then Mule_Raise := 2; end if;
         for I in Options'Range loop
            declare
               Item     : JSON_Value := Create_Object;
               Opt      : constant String := To_String (Options (I));
               Max_Bulk : constant Integer :=
                 (if Opt = "none" then Int_Field (LM, "MaxBulk", 0)
                  else Int_Field (CMB, To_String (Opt_Keys (I)), 0));
            begin
               Set_Field (Item, "commitment", Opt);
               Set_Field (Item, "maxBulk", Max_Bulk);
               Set_Field (Item, "remainingBulk",
                          Max_Bulk
                          + (if Opt = "none" or else Opt = "encumbered"
                             then 0 else Mule_Raise)
                          - Committed);
               Append (LA, Item);
            end;
         end loop;
         Set_Field (X, "loadLimits", LA);
      end;
      declare
         P  : constant JSON_Value := Get (E, "playbook");
         A  : constant JSON_Array :=
           (if Has_Field (P, "abilities") then Get (P, "abilities")
            else Empty_Array);
         AA : JSON_Array := Empty_Array;
      begin
         for I in 1 .. Length (A) loop
            declare
               Item      : JSON_Value := Create_Object;
               Name      : constant String := Str_Field (Get (A, I), "name");
               Taken     : constant Integer := Int_Field (Get (A, I), "timesTaken", 0);
               Max_Takes : Integer := Integer'Last;
            begin
               --  permissive fallback for unknown abilities mirrors the
               --  enforcement side (Can_Take_More)
               if Has_Field (G, "Playbooks") then
                  declare
                     PBs : constant JSON_Array := Get (G, "Playbooks");
                  begin
                     for J in 1 .. Length (PBs) loop
                        declare PB : constant JSON_Value := Get (PBs, J); begin
                           if Str_Field (PB, "Name") = Str_Field (P, "name")
                             and then Has_Field (PB, "SpecialAbilities")
                           then
                              declare
                                 SAs : constant JSON_Array := Get (PB, "SpecialAbilities");
                              begin
                                 for K in 1 .. Length (SAs) loop
                                    if Str_Field (Get (SAs, K), "Name") = Name then
                                       Max_Takes :=
                                         Int_Field (Get (SAs, K), "TimesTakeable",
                                                    Integer'Last);
                                    end if;
                                 end loop;
                              end;
                           end if;
                        end;
                     end loop;
                  end;
               end if;
               Set_Field (Item, "name", Name);
               Set_Field (Item, "timesTaken", Taken);
               Set_Field (Item, "maxTakes", Max_Takes);
               Set_Field (Item, "remaining", Max_Takes - Taken);
               Append (AA, Item);
            end;
         end loop;
         Set_Field (X, "availableAbilityTakes", AA);
      end;
      return X;
   end Character_Capabilities;

   function Crew_Capabilities (E : JSON_Value) return JSON_Value is
      G             : constant JSON_Value := Game (Str_Field (E, "gameStem") & "-crews");
      X             : JSON_Value := Create_Object;
      Type_Settings : JSON_Value := JSON_Null;
      UO            : JSON_Array := Empty_Array;
      AO            : JSON_Array := Empty_Array;
      Turf_Effective : Integer;
   begin
      Set_Field (X, "crewId", Str_Field (E, "id"));
      if G.Kind = JSON_Object_Type and then Has_Field (G, "CrewTypes") then
         declare
            Types : constant JSON_Array := Get (G, "CrewTypes");
         begin
            for I in 1 .. Length (Types) loop
               if Str_Field (Get (Types, I), "Name") = Str_Field (E, "crewTypeName") then
                  Type_Settings := Get (Types, I);
               end if;
            end loop;
         end;
      end if;
      if Type_Settings.Kind = JSON_Object_Type then
         if Has_Field (Type_Settings, "Upgrades") then
            declare
               Up : constant JSON_Array := Get (Type_Settings, "Upgrades");
            begin
               for I in 1 .. Length (Up) loop
                  declare
                     Item  : JSON_Value := Create_Object;
                     Name  : constant String := Str_Field (Get (Up, I), "Name");
                     Total : constant Integer := Int_Field (Get (Up, I), "TotalBoxes", 0);
                     Marked : constant Integer := Upgrade_Marked (E, Name);
                  begin
                     Set_Field (Item, "name", Name);
                     Set_Field (Item, "totalBoxes", Total);
                     Set_Field (Item, "marked", Marked);
                     Set_Field (Item, "remaining", Total - Marked);
                     Append (UO, Item);
                  end;
               end loop;
            end;
         end if;
         if Has_Field (Type_Settings, "SpecialAbilities") then
            declare
               SAs : constant JSON_Array := Get (Type_Settings, "SpecialAbilities");
            begin
               for I in 1 .. Length (SAs) loop
                  declare
                     Item      : JSON_Value := Create_Object;
                     Name      : constant String := Str_Field (Get (SAs, I), "Name");
                     Max_Takes : constant Integer := Int_Field (Get (SAs, I), "TimesTakeable", 0);
                     Taken     : constant Integer := Ability_Taken (E, Name);
                  begin
                     Set_Field (Item, "name", Name);
                     Set_Field (Item, "maxTakes", Max_Takes);
                     Set_Field (Item, "taken", Taken);
                     Set_Field (Item, "remaining", Max_Takes - Taken);
                     Append (AO, Item);
                  end;
               end loop;
            end;
         end if;
      end if;
      Set_Field (X, "upgrades", UO);
      Set_Field (X, "abilities", AO);
      Turf_Effective := Int_Field (E, "turf") + Turf_Effect_Delta (E);
      Set_Field (X, "effectiveTurf", Turf_Effective);
      Set_Field (X, "developThreshold",
                 Integer'Max (0, Int_Field (Get (E, "rep"), "max") - Turf_Effective));
      --  CONTRACT-04 review fix: publish the settings-derived Tier maximum
      --  so the frontend derives its display scale from data, never a
      --  hardcoded numeral list.  CrewTierMax is startup-required for every
      --  supported game, so this is always present once settings load.
      declare
         Stem : constant String := Str_Field (E, "gameStem");
         S    : constant Settings_Ref := (To_Unbounded_String (Stem), Game (Stem));
      begin
         if Settings_Int (S, "CrewTierMax", 0) > 0 then
            Set_Field (X, "tierMax", Settings_Int (S, "CrewTierMax", 0));
         end if;
      end;
return X;
   end Crew_Capabilities;

end Pitd_Capability;
