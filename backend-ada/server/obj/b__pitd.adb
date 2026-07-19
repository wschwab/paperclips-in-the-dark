pragma Warnings (Off);
pragma Ada_95;
pragma Source_File_Name (ada_main, Spec_File_Name => "b__pitd.ads");
pragma Source_File_Name (ada_main, Body_File_Name => "b__pitd.adb");
pragma Suppress (Overflow_Check);

with System.Restrictions;
with Ada.Exceptions;

package body ada_main is

   E074 : Short_Integer; pragma Import (Ada, E074, "system__os_lib_E");
   E011 : Short_Integer; pragma Import (Ada, E011, "ada__exceptions_E");
   E015 : Short_Integer; pragma Import (Ada, E015, "system__soft_links_E");
   E024 : Short_Integer; pragma Import (Ada, E024, "system__exception_table_E");
   E037 : Short_Integer; pragma Import (Ada, E037, "ada__containers_E");
   E069 : Short_Integer; pragma Import (Ada, E069, "ada__io_exceptions_E");
   E053 : Short_Integer; pragma Import (Ada, E053, "ada__strings_E");
   E055 : Short_Integer; pragma Import (Ada, E055, "ada__strings__maps_E");
   E059 : Short_Integer; pragma Import (Ada, E059, "ada__strings__maps__constants_E");
   E042 : Short_Integer; pragma Import (Ada, E042, "interfaces__c_E");
   E025 : Short_Integer; pragma Import (Ada, E025, "system__exceptions_E");
   E087 : Short_Integer; pragma Import (Ada, E087, "system__object_reader_E");
   E048 : Short_Integer; pragma Import (Ada, E048, "system__dwarf_lines_E");
   E017 : Short_Integer; pragma Import (Ada, E017, "system__soft_links__initialize_E");
   E036 : Short_Integer; pragma Import (Ada, E036, "system__traceback__symbolic_E");
   E261 : Short_Integer; pragma Import (Ada, E261, "ada__numerics_E");
   E128 : Short_Integer; pragma Import (Ada, E128, "ada__strings__utf_encoding_E");
   E136 : Short_Integer; pragma Import (Ada, E136, "ada__tags_E");
   E126 : Short_Integer; pragma Import (Ada, E126, "ada__strings__text_buffers_E");
   E277 : Short_Integer; pragma Import (Ada, E277, "gnat_E");
   E235 : Short_Integer; pragma Import (Ada, E235, "interfaces__c__strings_E");
   E124 : Short_Integer; pragma Import (Ada, E124, "ada__streams_E");
   E175 : Short_Integer; pragma Import (Ada, E175, "system__file_control_block_E");
   E146 : Short_Integer; pragma Import (Ada, E146, "system__finalization_root_E");
   E122 : Short_Integer; pragma Import (Ada, E122, "ada__finalization_E");
   E172 : Short_Integer; pragma Import (Ada, E172, "system__file_io_E");
   E271 : Short_Integer; pragma Import (Ada, E271, "ada__streams__stream_io_E");
   E179 : Short_Integer; pragma Import (Ada, E179, "system__storage_pools_E");
   E336 : Short_Integer; pragma Import (Ada, E336, "system__storage_pools__subpools_E");
   E158 : Short_Integer; pragma Import (Ada, E158, "ada__strings__unbounded_E");
   E200 : Short_Integer; pragma Import (Ada, E200, "system__task_info_E");
   E194 : Short_Integer; pragma Import (Ada, E194, "system__task_primitives__operations_E");
   E328 : Short_Integer; pragma Import (Ada, E328, "system__regpat_E");
   E105 : Short_Integer; pragma Import (Ada, E105, "ada__calendar_E");
   E186 : Short_Integer; pragma Import (Ada, E186, "ada__calendar__delays_E");
   E114 : Short_Integer; pragma Import (Ada, E114, "ada__calendar__time_zones_E");
   E243 : Short_Integer; pragma Import (Ada, E243, "ada__real_time_E");
   E181 : Short_Integer; pragma Import (Ada, E181, "ada__text_io_E");
   E322 : Short_Integer; pragma Import (Ada, E322, "gnat__calendar_E");
   E324 : Short_Integer; pragma Import (Ada, E324, "gnat__calendar__time_io_E");
   E427 : Short_Integer; pragma Import (Ada, E427, "gnat__secure_hashes_E");
   E429 : Short_Integer; pragma Import (Ada, E429, "gnat__secure_hashes__md5_E");
   E425 : Short_Integer; pragma Import (Ada, E425, "gnat__md5_E");
   E460 : Short_Integer; pragma Import (Ada, E460, "gnat__secure_hashes__sha1_E");
   E471 : Short_Integer; pragma Import (Ada, E471, "gnat__secure_hashes__sha2_common_E");
   E469 : Short_Integer; pragma Import (Ada, E469, "gnat__secure_hashes__sha2_32_E");
   E458 : Short_Integer; pragma Import (Ada, E458, "gnat__sha1_E");
   E467 : Short_Integer; pragma Import (Ada, E467, "gnat__sha256_E");
   E332 : Short_Integer; pragma Import (Ada, E332, "system__pool_global_E");
   E378 : Short_Integer; pragma Import (Ada, E378, "gnat__sockets_E");
   E381 : Short_Integer; pragma Import (Ada, E381, "gnat__sockets__poll_E");
   E388 : Short_Integer; pragma Import (Ada, E388, "gnat__sockets__thin_common_E");
   E383 : Short_Integer; pragma Import (Ada, E383, "gnat__sockets__thin_E");
   E299 : Short_Integer; pragma Import (Ada, E299, "system__random_seed_E");
   E177 : Short_Integer; pragma Import (Ada, E177, "system__regexp_E");
   E103 : Short_Integer; pragma Import (Ada, E103, "ada__directories_E");
   E215 : Short_Integer; pragma Import (Ada, E215, "system__tasking__initialization_E");
   E225 : Short_Integer; pragma Import (Ada, E225, "system__tasking__protected_objects_E");
   E227 : Short_Integer; pragma Import (Ada, E227, "system__tasking__protected_objects__entries_E");
   E223 : Short_Integer; pragma Import (Ada, E223, "system__tasking__queuing_E");
   E463 : Short_Integer; pragma Import (Ada, E463, "system__tasking__stages_E");
   E454 : Short_Integer; pragma Import (Ada, E454, "aws__containers__key_value_E");
   E402 : Short_Integer; pragma Import (Ada, E402, "aws__containers__string_vectors_E");
   E415 : Short_Integer; pragma Import (Ada, E415, "aws__containers__tables_E");
   E360 : Short_Integer; pragma Import (Ada, E360, "memory_streams_E");
   E370 : Short_Integer; pragma Import (Ada, E370, "templates_parser_tasking_E");
   E351 : Short_Integer; pragma Import (Ada, E351, "zlib_E");
   E353 : Short_Integer; pragma Import (Ada, E353, "zlib__thin_E");
   E310 : Short_Integer; pragma Import (Ada, E310, "templates_parser_E");
   E366 : Short_Integer; pragma Import (Ada, E366, "templates_parser__input_E");
   E368 : Short_Integer; pragma Import (Ada, E368, "templates_parser__utils_E");
   E247 : Short_Integer; pragma Import (Ada, E247, "aws__utils_E");
   E343 : Short_Integer; pragma Import (Ada, E343, "aws__resources_E");
   E362 : Short_Integer; pragma Import (Ada, E362, "aws__resources__files_E");
   E347 : Short_Integer; pragma Import (Ada, E347, "aws__resources__streams_E");
   E364 : Short_Integer; pragma Import (Ada, E364, "aws__resources__streams__disk_E");
   E355 : Short_Integer; pragma Import (Ada, E355, "aws__resources__streams__memory_E");
   E345 : Short_Integer; pragma Import (Ada, E345, "aws__resources__embedded_E");
   E349 : Short_Integer; pragma Import (Ada, E349, "aws__resources__streams__zlib_E");
   E241 : Short_Integer; pragma Import (Ada, E241, "aws__net_E");
   E245 : Short_Integer; pragma Import (Ada, E245, "aws__net__log_E");
   E372 : Short_Integer; pragma Import (Ada, E372, "aws__net__poll_events_E");
   E376 : Short_Integer; pragma Import (Ada, E376, "aws__net__std_E");
   E374 : Short_Integer; pragma Import (Ada, E374, "aws__net__ssl_E");
   E500 : Short_Integer; pragma Import (Ada, E500, "aws__net__generic_sets_E");
   E522 : Short_Integer; pragma Import (Ada, E522, "aws__net__acceptors_E");
   E502 : Short_Integer; pragma Import (Ada, E502, "aws__net__memory_E");
   E494 : Short_Integer; pragma Import (Ada, E494, "aws__net__ssl__certificate_E");
   E496 : Short_Integer; pragma Import (Ada, E496, "aws__net__ssl__certificate__impl_E");
   E419 : Short_Integer; pragma Import (Ada, E419, "aws__resources__streams__disk__once_E");
   E397 : Short_Integer; pragma Import (Ada, E397, "aws__resources__streams__memory__zlib_E");
   E395 : Short_Integer; pragma Import (Ada, E395, "aws__translator_E");
   E423 : Short_Integer; pragma Import (Ada, E423, "aws__digest_E");
   E392 : Short_Integer; pragma Import (Ada, E392, "aws__net__buffered_E");
   E231 : Short_Integer; pragma Import (Ada, E231, "aws__config_E");
   E237 : Short_Integer; pragma Import (Ada, E237, "aws__config__ini_E");
   E239 : Short_Integer; pragma Import (Ada, E239, "aws__config__utils_E");
   E413 : Short_Integer; pragma Import (Ada, E413, "aws__headers_E");
   E417 : Short_Integer; pragma Import (Ada, E417, "aws__headers__values_E");
   E435 : Short_Integer; pragma Import (Ada, E435, "aws__messages_E");
   E407 : Short_Integer; pragma Import (Ada, E407, "aws__mime_E");
   E442 : Short_Integer; pragma Import (Ada, E442, "aws__attachments_E");
   E405 : Short_Integer; pragma Import (Ada, E405, "aws__config__set_E");
   E526 : Short_Integer; pragma Import (Ada, E526, "aws__services__transient_pages_E");
   E530 : Short_Integer; pragma Import (Ada, E530, "aws__services__transient_pages__control_E");
   E456 : Short_Integer; pragma Import (Ada, E456, "aws__utils__streams_E");
   E452 : Short_Integer; pragma Import (Ada, E452, "aws__session_E");
   E532 : Short_Integer; pragma Import (Ada, E532, "aws__session__control_E");
   E444 : Short_Integer; pragma Import (Ada, E444, "aws__parameters_E");
   E446 : Short_Integer; pragma Import (Ada, E446, "aws__url_E");
   E437 : Short_Integer; pragma Import (Ada, E437, "aws__status_E");
   E411 : Short_Integer; pragma Import (Ada, E411, "aws__response_E");
   E490 : Short_Integer; pragma Import (Ada, E490, "aws__client_E");
   E492 : Short_Integer; pragma Import (Ada, E492, "aws__client__http_utils_E");
   E409 : Short_Integer; pragma Import (Ada, E409, "aws__dispatchers_E");
   E473 : Short_Integer; pragma Import (Ada, E473, "aws__dispatchers__callback_E");
   E508 : Short_Integer; pragma Import (Ada, E508, "aws__hotplug_E");
   E518 : Short_Integer; pragma Import (Ada, E518, "aws__hotplug__get_status_E");
   E475 : Short_Integer; pragma Import (Ada, E475, "aws__log_E");
   E479 : Short_Integer; pragma Import (Ada, E479, "aws__net__websocket_E");
   E510 : Short_Integer; pragma Import (Ada, E510, "aws__net__websocket__handshake_error_E");
   E480 : Short_Integer; pragma Import (Ada, E480, "aws__net__websocket__protocol_E");
   E482 : Short_Integer; pragma Import (Ada, E482, "aws__net__websocket__protocol__draft76_E");
   E484 : Short_Integer; pragma Import (Ada, E484, "aws__net__websocket__protocol__rfc6455_E");
   E498 : Short_Integer; pragma Import (Ada, E498, "aws__net__websocket__registry_E");
   E504 : Short_Integer; pragma Import (Ada, E504, "aws__net__websocket__registry__control_E");
   E512 : Short_Integer; pragma Import (Ada, E512, "aws__net__websocket__registry__utils_E");
   E421 : Short_Integer; pragma Import (Ada, E421, "aws__response__set_E");
   E184 : Short_Integer; pragma Import (Ada, E184, "aws__server_E");
   E514 : Short_Integer; pragma Import (Ada, E514, "aws__server__get_status_E");
   E506 : Short_Integer; pragma Import (Ada, E506, "aws__server__http_utils_E");
   E520 : Short_Integer; pragma Import (Ada, E520, "aws__server__log_E");
   E516 : Short_Integer; pragma Import (Ada, E516, "aws__server__status_E");
   E486 : Short_Integer; pragma Import (Ada, E486, "aws__status__set_E");
   E534 : Short_Integer; pragma Import (Ada, E534, "aws__status__translate_set_E");
   E448 : Short_Integer; pragma Import (Ada, E448, "aws__url__raise_url_error_E");
   E450 : Short_Integer; pragma Import (Ada, E450, "aws__url__set_E");
   E537 : Short_Integer; pragma Import (Ada, E537, "pitd_callback_E");

   Sec_Default_Sized_Stacks : array (1 .. 1) of aliased System.Secondary_Stack.SS_Stack (System.Parameters.Runtime_Default_Sec_Stack_Size);

   Local_Priority_Specific_Dispatching : constant String := "";
   Local_Interrupt_States : constant String := "";

   Is_Elaborated : Boolean := False;

   procedure finalize_library is
   begin
      E490 := E490 - 1;
      declare
         procedure F1;
         pragma Import (Ada, F1, "aws__server__finalize_body");
      begin
         E184 := E184 - 1;
         F1;
      end;
      declare
         procedure F2;
         pragma Import (Ada, F2, "aws__net__websocket__finalize_body");
      begin
         E479 := E479 - 1;
         F2;
      end;
      E444 := E444 - 1;
      declare
         procedure F3;
         pragma Import (Ada, F3, "aws__server__finalize_spec");
      begin
         F3;
      end;
      E411 := E411 - 1;
      declare
         procedure F4;
         pragma Import (Ada, F4, "aws__net__websocket__registry__finalize_body");
      begin
         E498 := E498 - 1;
         F4;
      end;
      E484 := E484 - 1;
      declare
         procedure F5;
         pragma Import (Ada, F5, "aws__net__websocket__protocol__rfc6455__finalize_spec");
      begin
         F5;
      end;
      E482 := E482 - 1;
      declare
         procedure F6;
         pragma Import (Ada, F6, "aws__net__websocket__protocol__draft76__finalize_spec");
      begin
         F6;
      end;
      declare
         procedure F7;
         pragma Import (Ada, F7, "aws__net__websocket__protocol__finalize_spec");
      begin
         E480 := E480 - 1;
         F7;
      end;
      E510 := E510 - 1;
      declare
         procedure F8;
         pragma Import (Ada, F8, "aws__net__websocket__handshake_error__finalize_spec");
      begin
         F8;
      end;
      declare
         procedure F9;
         pragma Import (Ada, F9, "aws__net__websocket__finalize_spec");
      begin
         F9;
      end;
      E475 := E475 - 1;
      declare
         procedure F10;
         pragma Import (Ada, F10, "aws__log__finalize_spec");
      begin
         F10;
      end;
      E508 := E508 - 1;
      declare
         procedure F11;
         pragma Import (Ada, F11, "aws__hotplug__finalize_spec");
      begin
         F11;
      end;
      E473 := E473 - 1;
      declare
         procedure F12;
         pragma Import (Ada, F12, "aws__dispatchers__callback__finalize_spec");
      begin
         F12;
      end;
      E409 := E409 - 1;
      declare
         procedure F13;
         pragma Import (Ada, F13, "aws__dispatchers__finalize_spec");
      begin
         F13;
      end;
      declare
         procedure F14;
         pragma Import (Ada, F14, "aws__client__finalize_spec");
      begin
         F14;
      end;
      declare
         procedure F15;
         pragma Import (Ada, F15, "aws__response__finalize_spec");
      begin
         F15;
      end;
      E437 := E437 - 1;
      declare
         procedure F16;
         pragma Import (Ada, F16, "aws__status__finalize_spec");
      begin
         F16;
      end;
      declare
         procedure F17;
         pragma Import (Ada, F17, "aws__parameters__finalize_spec");
      begin
         F17;
      end;
      declare
         procedure F18;
         pragma Import (Ada, F18, "aws__session__finalize_body");
      begin
         E452 := E452 - 1;
         F18;
      end;
      declare
         procedure F19;
         pragma Import (Ada, F19, "aws__session__finalize_spec");
      begin
         F19;
      end;
      E456 := E456 - 1;
      declare
         procedure F20;
         pragma Import (Ada, F20, "aws__utils__streams__finalize_spec");
      begin
         F20;
      end;
      declare
         procedure F21;
         pragma Import (Ada, F21, "aws__services__transient_pages__finalize_body");
      begin
         E526 := E526 - 1;
         F21;
      end;
      declare
         procedure F22;
         pragma Import (Ada, F22, "aws__services__transient_pages__finalize_spec");
      begin
         F22;
      end;
      declare
         procedure F23;
         pragma Import (Ada, F23, "aws__attachments__finalize_body");
      begin
         E442 := E442 - 1;
         F23;
      end;
      declare
         procedure F24;
         pragma Import (Ada, F24, "aws__attachments__finalize_spec");
      begin
         F24;
      end;
      declare
         procedure F25;
         pragma Import (Ada, F25, "aws__mime__finalize_body");
      begin
         E407 := E407 - 1;
         F25;
      end;
      E435 := E435 - 1;
      declare
         procedure F26;
         pragma Import (Ada, F26, "aws__messages__finalize_spec");
      begin
         F26;
      end;
      E413 := E413 - 1;
      declare
         procedure F27;
         pragma Import (Ada, F27, "aws__headers__finalize_spec");
      begin
         F27;
      end;
      declare
         procedure F28;
         pragma Import (Ada, F28, "aws__config__finalize_body");
      begin
         E231 := E231 - 1;
         F28;
      end;
      declare
         procedure F29;
         pragma Import (Ada, F29, "aws__config__finalize_spec");
      begin
         F29;
      end;
      E397 := E397 - 1;
      declare
         procedure F30;
         pragma Import (Ada, F30, "aws__resources__streams__memory__zlib__finalize_spec");
      begin
         F30;
      end;
      E419 := E419 - 1;
      declare
         procedure F31;
         pragma Import (Ada, F31, "aws__resources__streams__disk__once__finalize_spec");
      begin
         F31;
      end;
      E494 := E494 - 1;
      declare
         procedure F32;
         pragma Import (Ada, F32, "aws__net__ssl__certificate__finalize_spec");
      begin
         F32;
      end;
      declare
         procedure F33;
         pragma Import (Ada, F33, "aws__net__memory__finalize_body");
      begin
         E502 := E502 - 1;
         F33;
      end;
      declare
         procedure F34;
         pragma Import (Ada, F34, "aws__net__memory__finalize_spec");
      begin
         F34;
      end;
      E522 := E522 - 1;
      declare
         procedure F35;
         pragma Import (Ada, F35, "aws__net__acceptors__finalize_spec");
      begin
         F35;
      end;
      E241 := E241 - 1;
      E374 := E374 - 1;
      declare
         procedure F36;
         pragma Import (Ada, F36, "aws__net__ssl__finalize_spec");
      begin
         F36;
      end;
      E376 := E376 - 1;
      declare
         procedure F37;
         pragma Import (Ada, F37, "aws__net__std__finalize_spec");
      begin
         F37;
      end;
      E372 := E372 - 1;
      declare
         procedure F38;
         pragma Import (Ada, F38, "aws__net__poll_events__finalize_spec");
      begin
         F38;
      end;
      declare
         procedure F39;
         pragma Import (Ada, F39, "aws__net__log__finalize_body");
      begin
         E245 := E245 - 1;
         F39;
      end;
      declare
         procedure F40;
         pragma Import (Ada, F40, "aws__net__finalize_spec");
      begin
         F40;
      end;
      declare
         procedure F41;
         pragma Import (Ada, F41, "templates_parser__finalize_body");
      begin
         E310 := E310 - 1;
         F41;
      end;
      declare
         procedure F42;
         pragma Import (Ada, F42, "aws__resources__embedded__finalize_body");
      begin
         E345 := E345 - 1;
         F42;
      end;
      E349 := E349 - 1;
      declare
         procedure F43;
         pragma Import (Ada, F43, "aws__resources__streams__zlib__finalize_spec");
      begin
         F43;
      end;
      E355 := E355 - 1;
      declare
         procedure F44;
         pragma Import (Ada, F44, "aws__resources__streams__memory__finalize_spec");
      begin
         F44;
      end;
      E364 := E364 - 1;
      declare
         procedure F45;
         pragma Import (Ada, F45, "aws__resources__streams__disk__finalize_spec");
      begin
         F45;
      end;
      E347 := E347 - 1;
      declare
         procedure F46;
         pragma Import (Ada, F46, "aws__resources__streams__finalize_spec");
      begin
         F46;
      end;
      E247 := E247 - 1;
      declare
         procedure F47;
         pragma Import (Ada, F47, "aws__utils__finalize_spec");
      begin
         F47;
      end;
      declare
         procedure F48;
         pragma Import (Ada, F48, "templates_parser__finalize_spec");
      begin
         F48;
      end;
      E351 := E351 - 1;
      declare
         procedure F49;
         pragma Import (Ada, F49, "zlib__finalize_spec");
      begin
         F49;
      end;
      declare
         procedure F50;
         pragma Import (Ada, F50, "templates_parser_tasking__finalize_body");
      begin
         E370 := E370 - 1;
         F50;
      end;
      E415 := E415 - 1;
      declare
         procedure F51;
         pragma Import (Ada, F51, "aws__containers__tables__finalize_spec");
      begin
         F51;
      end;
      E402 := E402 - 1;
      declare
         procedure F52;
         pragma Import (Ada, F52, "aws__containers__string_vectors__finalize_spec");
      begin
         F52;
      end;
      E454 := E454 - 1;
      declare
         procedure F53;
         pragma Import (Ada, F53, "aws__containers__key_value__finalize_spec");
      begin
         F53;
      end;
      E227 := E227 - 1;
      declare
         procedure F54;
         pragma Import (Ada, F54, "system__tasking__protected_objects__entries__finalize_spec");
      begin
         F54;
      end;
      declare
         procedure F55;
         pragma Import (Ada, F55, "ada__directories__finalize_body");
      begin
         E103 := E103 - 1;
         F55;
      end;
      declare
         procedure F56;
         pragma Import (Ada, F56, "ada__directories__finalize_spec");
      begin
         F56;
      end;
      E177 := E177 - 1;
      declare
         procedure F57;
         pragma Import (Ada, F57, "system__regexp__finalize_spec");
      begin
         F57;
      end;
      declare
         procedure F58;
         pragma Import (Ada, F58, "gnat__sockets__finalize_body");
      begin
         E378 := E378 - 1;
         F58;
      end;
      declare
         procedure F59;
         pragma Import (Ada, F59, "gnat__sockets__finalize_spec");
      begin
         F59;
      end;
      E332 := E332 - 1;
      declare
         procedure F60;
         pragma Import (Ada, F60, "system__pool_global__finalize_spec");
      begin
         F60;
      end;
      E467 := E467 - 1;
      declare
         procedure F61;
         pragma Import (Ada, F61, "gnat__sha256__finalize_spec");
      begin
         F61;
      end;
      E458 := E458 - 1;
      declare
         procedure F62;
         pragma Import (Ada, F62, "gnat__sha1__finalize_spec");
      begin
         F62;
      end;
      E425 := E425 - 1;
      declare
         procedure F63;
         pragma Import (Ada, F63, "gnat__md5__finalize_spec");
      begin
         F63;
      end;
      E181 := E181 - 1;
      declare
         procedure F64;
         pragma Import (Ada, F64, "ada__text_io__finalize_spec");
      begin
         F64;
      end;
      E158 := E158 - 1;
      declare
         procedure F65;
         pragma Import (Ada, F65, "ada__strings__unbounded__finalize_spec");
      begin
         F65;
      end;
      E336 := E336 - 1;
      declare
         procedure F66;
         pragma Import (Ada, F66, "system__storage_pools__subpools__finalize_spec");
      begin
         F66;
      end;
      E271 := E271 - 1;
      declare
         procedure F67;
         pragma Import (Ada, F67, "ada__streams__stream_io__finalize_spec");
      begin
         F67;
      end;
      declare
         procedure F68;
         pragma Import (Ada, F68, "system__file_io__finalize_body");
      begin
         E172 := E172 - 1;
         F68;
      end;
      declare
         procedure Reraise_Library_Exception_If_Any;
            pragma Import (Ada, Reraise_Library_Exception_If_Any, "__gnat_reraise_library_exception_if_any");
      begin
         Reraise_Library_Exception_If_Any;
      end;
   end finalize_library;

   procedure adafinal is
      procedure s_stalib_adafinal;
      pragma Import (Ada, s_stalib_adafinal, "system__standard_library__adafinal");

      procedure Runtime_Finalize;
      pragma Import (C, Runtime_Finalize, "__gnat_runtime_finalize");

   begin
      if not Is_Elaborated then
         return;
      end if;
      Is_Elaborated := False;
      Runtime_Finalize;
      s_stalib_adafinal;
   end adafinal;

   type No_Param_Proc is access procedure;
   pragma Favor_Top_Level (No_Param_Proc);

   procedure adainit is
      Main_Priority : Integer;
      pragma Import (C, Main_Priority, "__gl_main_priority");
      Time_Slice_Value : Integer;
      pragma Import (C, Time_Slice_Value, "__gl_time_slice_val");
      WC_Encoding : Character;
      pragma Import (C, WC_Encoding, "__gl_wc_encoding");
      Locking_Policy : Character;
      pragma Import (C, Locking_Policy, "__gl_locking_policy");
      Queuing_Policy : Character;
      pragma Import (C, Queuing_Policy, "__gl_queuing_policy");
      Task_Dispatching_Policy : Character;
      pragma Import (C, Task_Dispatching_Policy, "__gl_task_dispatching_policy");
      Priority_Specific_Dispatching : System.Address;
      pragma Import (C, Priority_Specific_Dispatching, "__gl_priority_specific_dispatching");
      Num_Specific_Dispatching : Integer;
      pragma Import (C, Num_Specific_Dispatching, "__gl_num_specific_dispatching");
      Main_CPU : Integer;
      pragma Import (C, Main_CPU, "__gl_main_cpu");
      Interrupt_States : System.Address;
      pragma Import (C, Interrupt_States, "__gl_interrupt_states");
      Num_Interrupt_States : Integer;
      pragma Import (C, Num_Interrupt_States, "__gl_num_interrupt_states");
      Unreserve_All_Interrupts : Integer;
      pragma Import (C, Unreserve_All_Interrupts, "__gl_unreserve_all_interrupts");
      Detect_Blocking : Integer;
      pragma Import (C, Detect_Blocking, "__gl_detect_blocking");
      Default_Stack_Size : Integer;
      pragma Import (C, Default_Stack_Size, "__gl_default_stack_size");
      Default_Secondary_Stack_Size : System.Parameters.Size_Type;
      pragma Import (C, Default_Secondary_Stack_Size, "__gnat_default_ss_size");
      Bind_Env_Addr : System.Address;
      pragma Import (C, Bind_Env_Addr, "__gl_bind_env_addr");
      Interrupts_Default_To_System : Integer;
      pragma Import (C, Interrupts_Default_To_System, "__gl_interrupts_default_to_system");

      procedure Runtime_Initialize (Install_Handler : Integer);
      pragma Import (C, Runtime_Initialize, "__gnat_runtime_initialize");

      procedure Tasking_Runtime_Initialize;
      pragma Import (C, Tasking_Runtime_Initialize, "__gnat_tasking_runtime_initialize");

      Finalize_Library_Objects : No_Param_Proc;
      pragma Import (C, Finalize_Library_Objects, "__gnat_finalize_library_objects");
      Binder_Sec_Stacks_Count : Natural;
      pragma Import (Ada, Binder_Sec_Stacks_Count, "__gnat_binder_ss_count");
      Default_Sized_SS_Pool : System.Address;
      pragma Import (Ada, Default_Sized_SS_Pool, "__gnat_default_ss_pool");

   begin
      if Is_Elaborated then
         return;
      end if;
      Is_Elaborated := True;
      Main_Priority := -1;
      Time_Slice_Value := -1;
      WC_Encoding := 'b';
      Locking_Policy := ' ';
      Queuing_Policy := ' ';
      Task_Dispatching_Policy := ' ';
      System.Restrictions.Run_Time_Restrictions :=
        (Set =>
          (False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, True, False, False, False, False, 
           False, False, False, False, False, False, False, False, 
           False, False, False, False),
         Value => (0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
         Violated =>
          (True, True, False, False, True, True, False, False, 
           True, False, False, True, True, True, True, False, 
           False, False, False, True, False, False, True, True, 
           False, True, True, False, True, True, True, True, 
           False, True, False, True, False, True, True, False, 
           True, True, False, True, True, True, True, False, 
           True, True, True, True, False, False, True, False, 
           True, False, True, True, False, False, False, False, 
           False, True, True, True, True, True, True, True, 
           True, False, True, True, True, False, True, True, 
           False, True, True, True, True, False, False, False, 
           True, False, False, False, False, True, True, True, 
           True, False, True, False),
         Count => (0, 0, 0, 6, 3, 2, 4, 0, 17, 0),
         Unknown => (False, False, False, False, False, False, True, False, True, False));
      Priority_Specific_Dispatching :=
        Local_Priority_Specific_Dispatching'Address;
      Num_Specific_Dispatching := 0;
      Main_CPU := -1;
      Interrupt_States := Local_Interrupt_States'Address;
      Num_Interrupt_States := 0;
      Unreserve_All_Interrupts := 0;
      Detect_Blocking := 0;
      Default_Stack_Size := -1;

      ada_main'Elab_Body;
      Default_Secondary_Stack_Size := System.Parameters.Runtime_Default_Sec_Stack_Size;
      Binder_Sec_Stacks_Count := 1;
      Default_Sized_SS_Pool := Sec_Default_Sized_Stacks'Address;

      Runtime_Initialize (1);
      Tasking_Runtime_Initialize;

      Finalize_Library_Objects := finalize_library'access;

      Ada.Exceptions'Elab_Spec;
      System.Soft_Links'Elab_Spec;
      System.Exception_Table'Elab_Body;
      E024 := E024 + 1;
      Ada.Containers'Elab_Spec;
      E037 := E037 + 1;
      Ada.Io_Exceptions'Elab_Spec;
      E069 := E069 + 1;
      Ada.Strings'Elab_Spec;
      E053 := E053 + 1;
      Ada.Strings.Maps'Elab_Spec;
      E055 := E055 + 1;
      Ada.Strings.Maps.Constants'Elab_Spec;
      E059 := E059 + 1;
      Interfaces.C'Elab_Spec;
      E042 := E042 + 1;
      System.Exceptions'Elab_Spec;
      E025 := E025 + 1;
      System.Object_Reader'Elab_Spec;
      E087 := E087 + 1;
      System.Dwarf_Lines'Elab_Spec;
      E048 := E048 + 1;
      System.Os_Lib'Elab_Body;
      E074 := E074 + 1;
      System.Soft_Links.Initialize'Elab_Body;
      E017 := E017 + 1;
      E015 := E015 + 1;
      System.Traceback.Symbolic'Elab_Body;
      E036 := E036 + 1;
      E011 := E011 + 1;
      Ada.Numerics'Elab_Spec;
      E261 := E261 + 1;
      Ada.Strings.Utf_Encoding'Elab_Spec;
      E128 := E128 + 1;
      Ada.Tags'Elab_Spec;
      Ada.Tags'Elab_Body;
      E136 := E136 + 1;
      Ada.Strings.Text_Buffers'Elab_Spec;
      E126 := E126 + 1;
      Gnat'Elab_Spec;
      E277 := E277 + 1;
      Interfaces.C.Strings'Elab_Spec;
      E235 := E235 + 1;
      Ada.Streams'Elab_Spec;
      E124 := E124 + 1;
      System.File_Control_Block'Elab_Spec;
      E175 := E175 + 1;
      System.Finalization_Root'Elab_Spec;
      E146 := E146 + 1;
      Ada.Finalization'Elab_Spec;
      E122 := E122 + 1;
      System.File_Io'Elab_Body;
      E172 := E172 + 1;
      Ada.Streams.Stream_Io'Elab_Spec;
      E271 := E271 + 1;
      System.Storage_Pools'Elab_Spec;
      E179 := E179 + 1;
      System.Storage_Pools.Subpools'Elab_Spec;
      E336 := E336 + 1;
      Ada.Strings.Unbounded'Elab_Spec;
      E158 := E158 + 1;
      System.Task_Info'Elab_Spec;
      E200 := E200 + 1;
      System.Task_Primitives.Operations'Elab_Body;
      E194 := E194 + 1;
      System.Regpat'Elab_Spec;
      E328 := E328 + 1;
      Ada.Calendar'Elab_Spec;
      Ada.Calendar'Elab_Body;
      E105 := E105 + 1;
      Ada.Calendar.Delays'Elab_Body;
      E186 := E186 + 1;
      Ada.Calendar.Time_Zones'Elab_Spec;
      E114 := E114 + 1;
      Ada.Real_Time'Elab_Spec;
      Ada.Real_Time'Elab_Body;
      E243 := E243 + 1;
      Ada.Text_Io'Elab_Spec;
      Ada.Text_Io'Elab_Body;
      E181 := E181 + 1;
      Gnat.Calendar'Elab_Spec;
      E322 := E322 + 1;
      Gnat.Calendar.Time_Io'Elab_Spec;
      E324 := E324 + 1;
      E427 := E427 + 1;
      E429 := E429 + 1;
      Gnat.Md5'Elab_Spec;
      E425 := E425 + 1;
      E460 := E460 + 1;
      E471 := E471 + 1;
      E469 := E469 + 1;
      Gnat.Sha1'Elab_Spec;
      E458 := E458 + 1;
      Gnat.Sha256'Elab_Spec;
      E467 := E467 + 1;
      System.Pool_Global'Elab_Spec;
      E332 := E332 + 1;
      Gnat.Sockets'Elab_Spec;
      Gnat.Sockets.Thin_Common'Elab_Spec;
      E388 := E388 + 1;
      E383 := E383 + 1;
      Gnat.Sockets'Elab_Body;
      E378 := E378 + 1;
      E381 := E381 + 1;
      System.Random_Seed'Elab_Body;
      E299 := E299 + 1;
      System.Regexp'Elab_Spec;
      E177 := E177 + 1;
      Ada.Directories'Elab_Spec;
      Ada.Directories'Elab_Body;
      E103 := E103 + 1;
      System.Tasking.Initialization'Elab_Body;
      E215 := E215 + 1;
      System.Tasking.Protected_Objects'Elab_Body;
      E225 := E225 + 1;
      System.Tasking.Protected_Objects.Entries'Elab_Spec;
      E227 := E227 + 1;
      System.Tasking.Queuing'Elab_Body;
      E223 := E223 + 1;
      System.Tasking.Stages'Elab_Body;
      E463 := E463 + 1;
      AWS.CONTAINERS.KEY_VALUE'ELAB_SPEC;
      E454 := E454 + 1;
      AWS.CONTAINERS.STRING_VECTORS'ELAB_SPEC;
      E402 := E402 + 1;
      AWS.CONTAINERS.TABLES'ELAB_SPEC;
      AWS.CONTAINERS.TABLES'ELAB_BODY;
      E415 := E415 + 1;
      E360 := E360 + 1;
      Templates_Parser_Tasking'Elab_Body;
      E370 := E370 + 1;
      Zlib'Elab_Spec;
      Zlib.Thin'Elab_Body;
      E353 := E353 + 1;
      Zlib'Elab_Body;
      E351 := E351 + 1;
      Templates_Parser'Elab_Spec;
      Templates_Parser.Input'Elab_Spec;
      Templates_Parser.Utils'Elab_Spec;
      E368 := E368 + 1;
      AWS.UTILS'ELAB_SPEC;
      AWS.UTILS'ELAB_BODY;
      E247 := E247 + 1;
      AWS.RESOURCES'ELAB_SPEC;
      AWS.RESOURCES.STREAMS'ELAB_SPEC;
      AWS.RESOURCES.STREAMS'ELAB_BODY;
      E347 := E347 + 1;
      AWS.RESOURCES.STREAMS.DISK'ELAB_SPEC;
      AWS.RESOURCES.STREAMS.DISK'ELAB_BODY;
      E364 := E364 + 1;
      AWS.RESOURCES.STREAMS.MEMORY'ELAB_SPEC;
      AWS.RESOURCES.STREAMS.MEMORY'ELAB_BODY;
      E355 := E355 + 1;
      E343 := E343 + 1;
      AWS.RESOURCES.STREAMS.ZLIB'ELAB_SPEC;
      AWS.RESOURCES.STREAMS.ZLIB'ELAB_BODY;
      E349 := E349 + 1;
      AWS.RESOURCES.EMBEDDED'ELAB_BODY;
      E345 := E345 + 1;
      E362 := E362 + 1;
      Templates_Parser'Elab_Body;
      E310 := E310 + 1;
      E366 := E366 + 1;
      AWS.NET'ELAB_SPEC;
      AWS.NET.LOG'ELAB_BODY;
      E245 := E245 + 1;
      AWS.NET.POLL_EVENTS'ELAB_SPEC;
      AWS.NET.POLL_EVENTS'ELAB_BODY;
      E372 := E372 + 1;
      AWS.NET.STD'ELAB_SPEC;
      AWS.NET.STD'ELAB_BODY;
      E376 := E376 + 1;
      AWS.NET.SSL'ELAB_SPEC;
      AWS.NET.SSL'ELAB_BODY;
      E374 := E374 + 1;
      AWS.NET'ELAB_BODY;
      E241 := E241 + 1;
      E500 := E500 + 1;
      AWS.NET.ACCEPTORS'ELAB_SPEC;
      AWS.NET.ACCEPTORS'ELAB_BODY;
      E522 := E522 + 1;
      AWS.NET.MEMORY'ELAB_SPEC;
      AWS.NET.MEMORY'ELAB_BODY;
      E502 := E502 + 1;
      AWS.NET.SSL.CERTIFICATE'ELAB_SPEC;
      E496 := E496 + 1;
      E494 := E494 + 1;
      AWS.RESOURCES.STREAMS.DISK.ONCE'ELAB_SPEC;
      AWS.RESOURCES.STREAMS.DISK.ONCE'ELAB_BODY;
      E419 := E419 + 1;
      AWS.RESOURCES.STREAMS.MEMORY.ZLIB'ELAB_SPEC;
      AWS.RESOURCES.STREAMS.MEMORY.ZLIB'ELAB_BODY;
      E397 := E397 + 1;
      E395 := E395 + 1;
      AWS.DIGEST'ELAB_BODY;
      E423 := E423 + 1;
      AWS.NET.BUFFERED'ELAB_SPEC;
      AWS.NET.BUFFERED'ELAB_BODY;
      E392 := E392 + 1;
      AWS.CONFIG'ELAB_SPEC;
      AWS.CONFIG'ELAB_BODY;
      E231 := E231 + 1;
      E239 := E239 + 1;
      E237 := E237 + 1;
      AWS.HEADERS'ELAB_SPEC;
      AWS.HEADERS'ELAB_BODY;
      E413 := E413 + 1;
      AWS.HEADERS.VALUES'ELAB_BODY;
      E417 := E417 + 1;
      AWS.MESSAGES'ELAB_SPEC;
      E435 := E435 + 1;
      AWS.MIME'ELAB_BODY;
      E407 := E407 + 1;
      AWS.ATTACHMENTS'ELAB_SPEC;
      AWS.ATTACHMENTS'ELAB_BODY;
      E442 := E442 + 1;
      E405 := E405 + 1;
      AWS.SERVICES.TRANSIENT_PAGES'ELAB_SPEC;
      AWS.SERVICES.TRANSIENT_PAGES'ELAB_BODY;
      E526 := E526 + 1;
      E530 := E530 + 1;
      AWS.UTILS.STREAMS'ELAB_SPEC;
      E456 := E456 + 1;
      AWS.SESSION'ELAB_SPEC;
      AWS.SESSION'ELAB_BODY;
      E452 := E452 + 1;
      E532 := E532 + 1;
      AWS.PARAMETERS'ELAB_SPEC;
      AWS.URL'ELAB_SPEC;
      AWS.STATUS'ELAB_SPEC;
      E437 := E437 + 1;
      AWS.RESPONSE'ELAB_SPEC;
      AWS.CLIENT'ELAB_SPEC;
      AWS.DISPATCHERS'ELAB_SPEC;
      AWS.DISPATCHERS'ELAB_BODY;
      E409 := E409 + 1;
      AWS.DISPATCHERS.CALLBACK'ELAB_SPEC;
      AWS.DISPATCHERS.CALLBACK'ELAB_BODY;
      E473 := E473 + 1;
      AWS.HOTPLUG'ELAB_SPEC;
      E508 := E508 + 1;
      E518 := E518 + 1;
      AWS.LOG'ELAB_SPEC;
      AWS.LOG'ELAB_BODY;
      E475 := E475 + 1;
      AWS.NET.WEBSOCKET'ELAB_SPEC;
      AWS.NET.WEBSOCKET.HANDSHAKE_ERROR'ELAB_SPEC;
      AWS.NET.WEBSOCKET.HANDSHAKE_ERROR'ELAB_BODY;
      E510 := E510 + 1;
      AWS.NET.WEBSOCKET.PROTOCOL'ELAB_SPEC;
      E480 := E480 + 1;
      AWS.NET.WEBSOCKET.PROTOCOL.DRAFT76'ELAB_SPEC;
      AWS.NET.WEBSOCKET.PROTOCOL.DRAFT76'ELAB_BODY;
      E482 := E482 + 1;
      AWS.NET.WEBSOCKET.PROTOCOL.RFC6455'ELAB_SPEC;
      AWS.NET.WEBSOCKET.PROTOCOL.RFC6455'ELAB_BODY;
      E484 := E484 + 1;
      AWS.NET.WEBSOCKET.REGISTRY'ELAB_SPEC;
      AWS.NET.WEBSOCKET.REGISTRY'ELAB_BODY;
      E498 := E498 + 1;
      E504 := E504 + 1;
      E512 := E512 + 1;
      E492 := E492 + 1;
      AWS.RESPONSE'ELAB_BODY;
      E411 := E411 + 1;
      AWS.SERVER'ELAB_SPEC;
      AWS.PARAMETERS'ELAB_BODY;
      E444 := E444 + 1;
      E421 := E421 + 1;
      AWS.SERVER.HTTP_UTILS'ELAB_SPEC;
      E520 := E520 + 1;
      E514 := E514 + 1;
      AWS.NET.WEBSOCKET'ELAB_BODY;
      E479 := E479 + 1;
      AWS.SERVER.HTTP_UTILS'ELAB_BODY;
      E506 := E506 + 1;
      E534 := E534 + 1;
      AWS.SERVER'ELAB_BODY;
      E184 := E184 + 1;
      E448 := E448 + 1;
      E450 := E450 + 1;
      AWS.CLIENT'ELAB_BODY;
      E490 := E490 + 1;
      E516 := E516 + 1;
      E486 := E486 + 1;
      AWS.URL'ELAB_BODY;
      E446 := E446 + 1;
      Pitd_Callback'Elab_Body;
      E537 := E537 + 1;
   end adainit;

   procedure Ada_Main_Program;
   pragma Import (Ada, Ada_Main_Program, "_ada_pitd");

   function main
     (argc : Integer;
      argv : System.Address;
      envp : System.Address)
      return Integer
   is
      procedure Initialize (Addr : System.Address);
      pragma Import (C, Initialize, "__gnat_initialize");

      procedure Finalize;
      pragma Import (C, Finalize, "__gnat_finalize");
      SEH : aliased array (1 .. 2) of Integer;

      Ensure_Reference : aliased System.Address := Ada_Main_Program_Name'Address;
      pragma Volatile (Ensure_Reference);

   begin
      if gnat_argc = 0 then
         gnat_argc := argc;
         gnat_argv := argv;
      end if;
      gnat_envp := envp;

      Initialize (SEH'Address);
      adainit;
      Ada_Main_Program;
      adafinal;
      Finalize;
      return (gnat_exit_status);
   end;

--  BEGIN Object file/option list
   --   /home/x/code/paperclips-in-the-dark/backend-ada/server/obj/pitd_callback.o
   --   /home/x/code/paperclips-in-the-dark/backend-ada/server/obj/pitd.o
   --   -L/home/x/code/paperclips-in-the-dark/backend-ada/server/obj/
   --   -L/home/x/code/paperclips-in-the-dark/backend-ada/server/obj/
   --   -L/home/x/.local/share/alire/builds/aws_21.0.0_57fddf8f/b44708f5c122bf06ab79d2545e01d159db316e31cbb67e7ba08b1922cc9c1560/install_dir/lib/aws.static/
   --   -L/home/x/.local/share/alire/toolchains/gnat_native_16.1.0_9f74f58a/lib/gcc/x86_64-pc-linux-gnu/16.1.0/adalib/
   --   -static
   --   -lgnarl
   --   -lgnat
   --   -lrt
   --   -lpthread
   --   -lm
   --   -ldl
--  END Object file/option list   

end ada_main;
