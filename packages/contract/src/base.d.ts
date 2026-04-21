import * as _orpc_contract0 from "@orpc/contract";
import { ContractRouterClient } from "@orpc/contract";
import * as zod from "zod";
import { z } from "zod";
import * as zod_v4_core0 from "zod/v4/core";

//#region src/schemas/column.d.ts
declare const ColumnAddInputSchema: z.ZodObject<{
  tableId: z.ZodUUID;
  data: z.ZodObject<{
    id: z.ZodOptional<z.ZodUUID>;
    name: z.ZodString;
    config: z.ZodDiscriminatedUnion<[z.ZodObject<{
      type: z.ZodLiteral<"string">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"number">;
      decimal: z.ZodDefault<z.ZodNumber>;
      format: z.ZodDefault<z.ZodEnum<{
        number: "number";
        currency: "currency";
        percent: "percent";
      }>>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"boolean">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"date">;
      dateFormat: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"select">;
      options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        value: z.ZodString;
        color: z.ZodString;
      }, z.core.$strip>>>;
    }, z.core.$strip>], "type">;
    position: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strict>;
}, z.core.$strip>;
declare const ColumnAddOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
declare const ColumnUpdateInputSchema: z.ZodObject<{
  columnId: z.ZodUUID;
  data: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
      type: z.ZodLiteral<"string">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"number">;
      decimal: z.ZodDefault<z.ZodNumber>;
      format: z.ZodDefault<z.ZodEnum<{
        number: "number";
        currency: "currency";
        percent: "percent";
      }>>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"boolean">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"date">;
      dateFormat: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"select">;
      options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        value: z.ZodString;
        color: z.ZodString;
      }, z.core.$strip>>>;
    }, z.core.$strip>], "type">>;
    width: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  }, z.core.$strict>;
}, z.core.$strip>;
declare const ColumnUpdateOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
declare const ColumnDeleteInputSchema: z.ZodObject<{
  columnId: z.ZodUUID;
}, z.core.$strip>;
declare const ColumnDeleteOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
//#endregion
//#region src/schemas/custom-table.d.ts
declare const CustomTableListInputSchema: z.ZodObject<{}, z.core.$strip>;
type CustomTableListInput = z.infer<typeof CustomTableListInputSchema>;
declare const CustomTableListItemSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
}, z.core.$strip>;
type CustomTableListItem = z.infer<typeof CustomTableListItemSchema>;
declare const CustomTableListOutputSchema: z.ZodArray<z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
}, z.core.$strip>>;
type CustomTableListOutput = z.infer<typeof CustomTableListOutputSchema>;
declare const CustomTableCreateInputSchema: z.ZodObject<{
  id: z.ZodOptional<z.ZodUUID>;
  name: z.ZodString;
}, z.core.$strip>;
type CustomTableCreateInput = z.infer<typeof CustomTableCreateInputSchema>;
declare const CustomTableCreateOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
type CustomTableCreateOutput = z.infer<typeof CustomTableCreateOutputSchema>;
declare const CustomTableUpdateInputSchema: z.ZodObject<{
  id: z.ZodUUID;
  name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type CustomTableUpdateInput = z.infer<typeof CustomTableUpdateInputSchema>;
declare const CustomTableUpdateOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
type CustomTableUpdateOutput = z.infer<typeof CustomTableUpdateOutputSchema>;
declare const CustomTableDeleteInputSchema: z.ZodObject<{
  id: z.ZodUUID;
}, z.core.$strip>;
type CustomTableDeleteInput = z.infer<typeof CustomTableDeleteInputSchema>;
declare const CustomTableDeleteOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
type CustomTableDeleteOutput = z.infer<typeof CustomTableDeleteOutputSchema>;
declare const CustomTableGetInputSchema: z.ZodObject<{
  id: z.ZodUUID;
}, z.core.$strip>;
type CustomTableGetInput = z.infer<typeof CustomTableGetInputSchema>;
declare const CustomTableGetSchemaInputSchema: z.ZodObject<{
  id: z.ZodUUID;
}, z.core.$strip>;
type CustomTableGetSchemaInput = z.infer<typeof CustomTableGetSchemaInputSchema>;
declare const TableColumnSchema: z.ZodObject<{
  id: z.ZodString;
  tableId: z.ZodString;
  name: z.ZodString;
  config: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"string">;
  }, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"number">;
    decimal: z.ZodDefault<z.ZodNumber>;
    format: z.ZodDefault<z.ZodEnum<{
      number: "number";
      currency: "currency";
      percent: "percent";
    }>>;
  }, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"boolean">;
  }, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"date">;
    dateFormat: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"select">;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
      id: z.ZodString;
      value: z.ZodString;
      color: z.ZodString;
    }, z.core.$strip>>>;
  }, z.core.$strip>], "type">;
  position: z.ZodNumber;
  isPrimary: z.ZodBoolean;
  width: z.ZodNullable<z.ZodNumber>;
  createdAt: z.ZodCoercedDate<unknown>;
  updatedAt: z.ZodCoercedDate<unknown>;
}, z.core.$strip>;
type TableColumn = z.infer<typeof TableColumnSchema>;
declare const TableRowSchema: z.ZodObject<{
  id: z.ZodString;
  tableId: z.ZodString;
  cells: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  position: z.ZodNullable<z.ZodNumber>;
  createdAt: z.ZodCoercedDate<unknown>;
  updatedAt: z.ZodCoercedDate<unknown>;
}, z.core.$strip>;
type TableRow = z.infer<typeof TableRowSchema>;
declare const TableViewSchema: z.ZodObject<{
  id: z.ZodString;
  tableId: z.ZodString;
  name: z.ZodString;
  type: z.ZodEnum<{
    table: "table";
    kanban: "kanban";
    gallery: "gallery";
  }>;
  config: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  filters: z.ZodNullable<z.ZodArray<z.ZodUnknown>>;
  sorts: z.ZodNullable<z.ZodArray<z.ZodUnknown>>;
  position: z.ZodNumber;
  createdAt: z.ZodCoercedDate<unknown>;
  updatedAt: z.ZodCoercedDate<unknown>;
}, z.core.$strip>;
type TableView = z.infer<typeof TableViewSchema>;
declare const CustomTableGetOutputSchema: z.ZodObject<{
  id: z.ZodString;
  userId: z.ZodString;
  name: z.ZodString;
  createdAt: z.ZodCoercedDate<unknown>;
  updatedAt: z.ZodCoercedDate<unknown>;
  columns: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    tableId: z.ZodString;
    name: z.ZodString;
    config: z.ZodDiscriminatedUnion<[z.ZodObject<{
      type: z.ZodLiteral<"string">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"number">;
      decimal: z.ZodDefault<z.ZodNumber>;
      format: z.ZodDefault<z.ZodEnum<{
        number: "number";
        currency: "currency";
        percent: "percent";
      }>>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"boolean">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"date">;
      dateFormat: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"select">;
      options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        value: z.ZodString;
        color: z.ZodString;
      }, z.core.$strip>>>;
    }, z.core.$strip>], "type">;
    position: z.ZodNumber;
    isPrimary: z.ZodBoolean;
    width: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodCoercedDate<unknown>;
    updatedAt: z.ZodCoercedDate<unknown>;
  }, z.core.$strip>>;
  rows: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    tableId: z.ZodString;
    cells: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    position: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodCoercedDate<unknown>;
    updatedAt: z.ZodCoercedDate<unknown>;
  }, z.core.$strip>>;
  views: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    tableId: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<{
      table: "table";
      kanban: "kanban";
      gallery: "gallery";
    }>;
    config: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    filters: z.ZodNullable<z.ZodArray<z.ZodUnknown>>;
    sorts: z.ZodNullable<z.ZodArray<z.ZodUnknown>>;
    position: z.ZodNumber;
    createdAt: z.ZodCoercedDate<unknown>;
    updatedAt: z.ZodCoercedDate<unknown>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type CustomTableGetOutput = z.infer<typeof CustomTableGetOutputSchema>;
declare const CustomTableGetSchemaOutputSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  updatedAt: z.ZodCoercedDate<unknown>;
  columns: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    tableId: z.ZodString;
    name: z.ZodString;
    config: z.ZodDiscriminatedUnion<[z.ZodObject<{
      type: z.ZodLiteral<"string">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"number">;
      decimal: z.ZodDefault<z.ZodNumber>;
      format: z.ZodDefault<z.ZodEnum<{
        number: "number";
        currency: "currency";
        percent: "percent";
      }>>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"boolean">;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"date">;
      dateFormat: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      type: z.ZodLiteral<"select">;
      options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        value: z.ZodString;
        color: z.ZodString;
      }, z.core.$strip>>>;
    }, z.core.$strip>], "type">;
    position: z.ZodNumber;
    isPrimary: z.ZodBoolean;
    width: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodCoercedDate<unknown>;
    updatedAt: z.ZodCoercedDate<unknown>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type CustomTableGetSchemaOutput = z.infer<typeof CustomTableGetSchemaOutputSchema>;
//#endregion
//#region src/schemas/notebase-beta.d.ts
declare const NotebaseBetaStatusInputSchema: z.ZodObject<{}, z.core.$strict>;
type NotebaseBetaStatusInput = z.infer<typeof NotebaseBetaStatusInputSchema>;
declare const NotebaseBetaStatusOutputSchema: z.ZodObject<{
  allowed: z.ZodBoolean;
}, z.core.$strip>;
type NotebaseBetaStatusOutput = z.infer<typeof NotebaseBetaStatusOutputSchema>;
//#endregion
//#region src/schemas/row.d.ts
declare const RowAddInputSchema: z.ZodObject<{
  tableId: z.ZodUUID;
  data: z.ZodObject<{
    id: z.ZodOptional<z.ZodUUID>;
    cells: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    position: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strict>;
}, z.core.$strip>;
type RowAddInput = z.infer<typeof RowAddInputSchema>;
declare const RowAddOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
type RowAddOutput = z.infer<typeof RowAddOutputSchema>;
declare const RowUpdateInputSchema: z.ZodObject<{
  rowId: z.ZodUUID;
  data: z.ZodObject<{
    cells: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    position: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strict>;
}, z.core.$strip>;
type RowUpdateInput = z.infer<typeof RowUpdateInputSchema>;
declare const RowUpdateOutputSchema: z.ZodObject<{
  id: z.ZodUUID;
  tableId: z.ZodUUID;
  cells: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  position: z.ZodNullable<z.ZodNumber>;
  createdAt: z.ZodDate;
  updatedAt: z.ZodDate;
  txid: z.ZodNumber;
}, z.core.$strip>;
type RowUpdateOutput = z.infer<typeof RowUpdateOutputSchema>;
declare const RowDeleteInputSchema: z.ZodObject<{
  rowId: z.ZodUUID;
}, z.core.$strip>;
type RowDeleteInput = z.infer<typeof RowDeleteInputSchema>;
declare const RowDeleteOutputSchema: z.ZodObject<{
  txid: z.ZodNumber;
}, z.core.$strip>;
type RowDeleteOutput = z.infer<typeof RowDeleteOutputSchema>;
//#endregion
//#region src/index.d.ts
declare const contract: {
  customTable: {
    list: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{}, zod_v4_core0.$strip>, zod.ZodArray<zod.ZodObject<{
      id: zod.ZodString;
      name: zod.ZodString;
    }, zod_v4_core0.$strip>>, Record<never, never>, Record<never, never>>;
    get: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      id: zod.ZodUUID;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      id: zod.ZodString;
      userId: zod.ZodString;
      name: zod.ZodString;
      createdAt: zod.ZodCoercedDate<unknown>;
      updatedAt: zod.ZodCoercedDate<unknown>;
      columns: zod.ZodArray<zod.ZodObject<{
        id: zod.ZodString;
        tableId: zod.ZodString;
        name: zod.ZodString;
        config: zod.ZodDiscriminatedUnion<[zod.ZodObject<{
          type: zod.ZodLiteral<"string">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"number">;
          decimal: zod.ZodDefault<zod.ZodNumber>;
          format: zod.ZodDefault<zod.ZodEnum<{
            number: "number";
            currency: "currency";
            percent: "percent";
          }>>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"boolean">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"date">;
          dateFormat: zod.ZodOptional<zod.ZodString>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"select">;
          options: zod.ZodDefault<zod.ZodArray<zod.ZodObject<{
            id: zod.ZodString;
            value: zod.ZodString;
            color: zod.ZodString;
          }, zod_v4_core0.$strip>>>;
        }, zod_v4_core0.$strip>], "type">;
        position: zod.ZodNumber;
        isPrimary: zod.ZodBoolean;
        width: zod.ZodNullable<zod.ZodNumber>;
        createdAt: zod.ZodCoercedDate<unknown>;
        updatedAt: zod.ZodCoercedDate<unknown>;
      }, zod_v4_core0.$strip>>;
      rows: zod.ZodArray<zod.ZodObject<{
        id: zod.ZodString;
        tableId: zod.ZodString;
        cells: zod.ZodRecord<zod.ZodString, zod.ZodUnknown>;
        position: zod.ZodNullable<zod.ZodNumber>;
        createdAt: zod.ZodCoercedDate<unknown>;
        updatedAt: zod.ZodCoercedDate<unknown>;
      }, zod_v4_core0.$strip>>;
      views: zod.ZodArray<zod.ZodObject<{
        id: zod.ZodString;
        tableId: zod.ZodString;
        name: zod.ZodString;
        type: zod.ZodEnum<{
          table: "table";
          kanban: "kanban";
          gallery: "gallery";
        }>;
        config: zod.ZodNullable<zod.ZodRecord<zod.ZodString, zod.ZodUnknown>>;
        filters: zod.ZodNullable<zod.ZodArray<zod.ZodUnknown>>;
        sorts: zod.ZodNullable<zod.ZodArray<zod.ZodUnknown>>;
        position: zod.ZodNumber;
        createdAt: zod.ZodCoercedDate<unknown>;
        updatedAt: zod.ZodCoercedDate<unknown>;
      }, zod_v4_core0.$strip>>;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    getSchema: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      id: zod.ZodUUID;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      id: zod.ZodString;
      name: zod.ZodString;
      updatedAt: zod.ZodCoercedDate<unknown>;
      columns: zod.ZodArray<zod.ZodObject<{
        id: zod.ZodString;
        tableId: zod.ZodString;
        name: zod.ZodString;
        config: zod.ZodDiscriminatedUnion<[zod.ZodObject<{
          type: zod.ZodLiteral<"string">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"number">;
          decimal: zod.ZodDefault<zod.ZodNumber>;
          format: zod.ZodDefault<zod.ZodEnum<{
            number: "number";
            currency: "currency";
            percent: "percent";
          }>>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"boolean">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"date">;
          dateFormat: zod.ZodOptional<zod.ZodString>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"select">;
          options: zod.ZodDefault<zod.ZodArray<zod.ZodObject<{
            id: zod.ZodString;
            value: zod.ZodString;
            color: zod.ZodString;
          }, zod_v4_core0.$strip>>>;
        }, zod_v4_core0.$strip>], "type">;
        position: zod.ZodNumber;
        isPrimary: zod.ZodBoolean;
        width: zod.ZodNullable<zod.ZodNumber>;
        createdAt: zod.ZodCoercedDate<unknown>;
        updatedAt: zod.ZodCoercedDate<unknown>;
      }, zod_v4_core0.$strip>>;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    create: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      id: zod.ZodOptional<zod.ZodUUID>;
      name: zod.ZodString;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    update: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      id: zod.ZodUUID;
      name: zod.ZodOptional<zod.ZodString>;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    delete: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      id: zod.ZodUUID;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
  };
  column: {
    add: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      tableId: zod.ZodUUID;
      data: zod.ZodObject<{
        id: zod.ZodOptional<zod.ZodUUID>;
        name: zod.ZodString;
        config: zod.ZodDiscriminatedUnion<[zod.ZodObject<{
          type: zod.ZodLiteral<"string">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"number">;
          decimal: zod.ZodDefault<zod.ZodNumber>;
          format: zod.ZodDefault<zod.ZodEnum<{
            number: "number";
            currency: "currency";
            percent: "percent";
          }>>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"boolean">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"date">;
          dateFormat: zod.ZodOptional<zod.ZodString>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"select">;
          options: zod.ZodDefault<zod.ZodArray<zod.ZodObject<{
            id: zod.ZodString;
            value: zod.ZodString;
            color: zod.ZodString;
          }, zod_v4_core0.$strip>>>;
        }, zod_v4_core0.$strip>], "type">;
        position: zod.ZodOptional<zod.ZodNumber>;
      }, zod_v4_core0.$strict>;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    update: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      columnId: zod.ZodUUID;
      data: zod.ZodObject<{
        name: zod.ZodOptional<zod.ZodString>;
        config: zod.ZodOptional<zod.ZodDiscriminatedUnion<[zod.ZodObject<{
          type: zod.ZodLiteral<"string">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"number">;
          decimal: zod.ZodDefault<zod.ZodNumber>;
          format: zod.ZodDefault<zod.ZodEnum<{
            number: "number";
            currency: "currency";
            percent: "percent";
          }>>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"boolean">;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"date">;
          dateFormat: zod.ZodOptional<zod.ZodString>;
        }, zod_v4_core0.$strip>, zod.ZodObject<{
          type: zod.ZodLiteral<"select">;
          options: zod.ZodDefault<zod.ZodArray<zod.ZodObject<{
            id: zod.ZodString;
            value: zod.ZodString;
            color: zod.ZodString;
          }, zod_v4_core0.$strip>>>;
        }, zod_v4_core0.$strip>], "type">>;
        width: zod.ZodOptional<zod.ZodNullable<zod.ZodNumber>>;
      }, zod_v4_core0.$strict>;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    delete: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      columnId: zod.ZodUUID;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
  };
  row: {
    add: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      tableId: zod.ZodUUID;
      data: zod.ZodObject<{
        id: zod.ZodOptional<zod.ZodUUID>;
        cells: zod.ZodRecord<zod.ZodString, zod.ZodUnknown>;
        position: zod.ZodOptional<zod.ZodNumber>;
      }, zod_v4_core0.$strict>;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    update: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      rowId: zod.ZodUUID;
      data: zod.ZodObject<{
        cells: zod.ZodOptional<zod.ZodRecord<zod.ZodString, zod.ZodUnknown>>;
        position: zod.ZodOptional<zod.ZodNumber>;
      }, zod_v4_core0.$strict>;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      id: zod.ZodUUID;
      tableId: zod.ZodUUID;
      cells: zod.ZodRecord<zod.ZodString, zod.ZodUnknown>;
      position: zod.ZodNullable<zod.ZodNumber>;
      createdAt: zod.ZodDate;
      updatedAt: zod.ZodDate;
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
    delete: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{
      rowId: zod.ZodUUID;
    }, zod_v4_core0.$strip>, zod.ZodObject<{
      txid: zod.ZodNumber;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
  };
  notebaseBeta: {
    status: _orpc_contract0.ContractProcedureBuilderWithInputOutput<zod.ZodObject<{}, zod_v4_core0.$strict>, zod.ZodObject<{
      allowed: zod.ZodBoolean;
    }, zod_v4_core0.$strip>, Record<never, never>, Record<never, never>>;
  };
};
type ORPCRouterClient = ContractRouterClient<typeof contract>;
//#endregion
export { ColumnAddInputSchema, ColumnAddOutputSchema, ColumnDeleteInputSchema, ColumnDeleteOutputSchema, ColumnUpdateInputSchema, ColumnUpdateOutputSchema, CustomTableCreateInput, CustomTableCreateInputSchema, CustomTableCreateOutput, CustomTableCreateOutputSchema, CustomTableDeleteInput, CustomTableDeleteInputSchema, CustomTableDeleteOutput, CustomTableDeleteOutputSchema, CustomTableGetInput, CustomTableGetInputSchema, CustomTableGetOutput, CustomTableGetOutputSchema, CustomTableGetSchemaInput, CustomTableGetSchemaInputSchema, CustomTableGetSchemaOutput, CustomTableGetSchemaOutputSchema, CustomTableListInput, CustomTableListInputSchema, CustomTableListItem, CustomTableListItemSchema, CustomTableListOutput, CustomTableListOutputSchema, CustomTableUpdateInput, CustomTableUpdateInputSchema, CustomTableUpdateOutput, CustomTableUpdateOutputSchema, NotebaseBetaStatusInput, NotebaseBetaStatusInputSchema, NotebaseBetaStatusOutput, NotebaseBetaStatusOutputSchema, ORPCRouterClient, RowAddInput, RowAddInputSchema, RowAddOutput, RowAddOutputSchema, RowDeleteInput, RowDeleteInputSchema, RowDeleteOutput, RowDeleteOutputSchema, RowUpdateInput, RowUpdateInputSchema, RowUpdateOutput, RowUpdateOutputSchema, TableColumn, TableColumnSchema, TableRow, TableRowSchema, TableView, TableViewSchema, contract };
