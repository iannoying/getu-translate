import { oc } from "@orpc/contract";
import { COLUMN_MAX_WIDTH, COLUMN_MIN_WIDTH, columnConfigSchema } from "@getu/definitions";
import { z } from "zod";

//#region src/schemas/column.ts
const ColumnAddInputSchema = z.object({
	tableId: z.uuid(),
	data: z.object({
		id: z.uuid().optional(),
		name: z.string().min(1),
		config: columnConfigSchema,
		position: z.number().int().optional()
	}).strict()
});
const ColumnAddOutputSchema = z.object({ txid: z.number() });
const ColumnUpdateInputSchema = z.object({
	columnId: z.uuid(),
	data: z.object({
		name: z.string().min(1).optional(),
		config: columnConfigSchema.optional(),
		width: z.number().int().min(COLUMN_MIN_WIDTH).max(COLUMN_MAX_WIDTH).nullable().optional()
	}).strict()
});
const ColumnUpdateOutputSchema = z.object({ txid: z.number() });
const ColumnDeleteInputSchema = z.object({ columnId: z.uuid() });
const ColumnDeleteOutputSchema = z.object({ txid: z.number() });

//#endregion
//#region src/contracts/column.ts
const columnContract = {
	add: oc.route({
		method: "POST",
		path: "/columns",
		summary: "Add column to table",
		tags: ["Columns"]
	}).input(ColumnAddInputSchema).output(ColumnAddOutputSchema),
	update: oc.route({
		method: "PATCH",
		path: "/columns/{columnId}",
		summary: "Update column name",
		tags: ["Columns"]
	}).input(ColumnUpdateInputSchema).output(ColumnUpdateOutputSchema),
	delete: oc.route({
		method: "DELETE",
		path: "/columns/{columnId}",
		summary: "Delete column",
		tags: ["Columns"]
	}).input(ColumnDeleteInputSchema).output(ColumnDeleteOutputSchema)
};

//#endregion
//#region src/schemas/custom-table.ts
const CustomTableListInputSchema = z.object({});
const CustomTableListItemSchema = z.object({
	id: z.string(),
	name: z.string()
});
const CustomTableListOutputSchema = z.array(CustomTableListItemSchema);
const CustomTableCreateInputSchema = z.object({
	id: z.uuid().optional(),
	name: z.string().min(1)
});
const CustomTableCreateOutputSchema = z.object({ txid: z.number() });
const CustomTableUpdateInputSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1).optional()
});
const CustomTableUpdateOutputSchema = z.object({ txid: z.number() });
const CustomTableDeleteInputSchema = z.object({ id: z.uuid() });
const CustomTableDeleteOutputSchema = z.object({ txid: z.number() });
const CustomTableGetInputSchema = z.object({ id: z.uuid() });
const CustomTableGetSchemaInputSchema = z.object({ id: z.uuid() });
const TableColumnSchema = z.object({
	id: z.string(),
	tableId: z.string(),
	name: z.string(),
	config: columnConfigSchema,
	position: z.number(),
	isPrimary: z.boolean(),
	width: z.number().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});
const TableRowSchema = z.object({
	id: z.string(),
	tableId: z.string(),
	cells: z.record(z.string(), z.unknown()),
	position: z.number().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});
const TableViewSchema = z.object({
	id: z.string(),
	tableId: z.string(),
	name: z.string(),
	type: z.enum([
		"table",
		"kanban",
		"gallery"
	]),
	config: z.record(z.string(), z.unknown()).nullable(),
	filters: z.array(z.unknown()).nullable(),
	sorts: z.array(z.unknown()).nullable(),
	position: z.number(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});
const CustomTableGetOutputSchema = z.object({
	id: z.string(),
	userId: z.string(),
	name: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	columns: z.array(TableColumnSchema),
	rows: z.array(TableRowSchema),
	views: z.array(TableViewSchema)
});
const CustomTableGetSchemaOutputSchema = z.object({
	id: z.string(),
	name: z.string(),
	updatedAt: z.coerce.date(),
	columns: z.array(TableColumnSchema)
});

//#endregion
//#region src/contracts/custom-table.ts
const customTableContract = {
	list: oc.route({
		method: "GET",
		path: "/custom-tables",
		summary: "List custom tables",
		tags: ["Custom Tables"]
	}).input(CustomTableListInputSchema).output(CustomTableListOutputSchema),
	get: oc.route({
		method: "GET",
		path: "/custom-tables/{id}",
		summary: "Get custom table with columns, rows, and views",
		tags: ["Custom Tables"]
	}).input(CustomTableGetInputSchema).output(CustomTableGetOutputSchema),
	getSchema: oc.route({
		method: "GET",
		path: "/custom-tables/{id}/schema",
		summary: "Get custom table schema",
		tags: ["Custom Tables"]
	}).input(CustomTableGetSchemaInputSchema).output(CustomTableGetSchemaOutputSchema),
	create: oc.route({
		method: "POST",
		path: "/custom-tables",
		summary: "Create custom table",
		tags: ["Custom Tables"]
	}).input(CustomTableCreateInputSchema).output(CustomTableCreateOutputSchema),
	update: oc.route({
		method: "PUT",
		path: "/custom-tables/{id}",
		summary: "Update custom table",
		tags: ["Custom Tables"]
	}).input(CustomTableUpdateInputSchema).output(CustomTableUpdateOutputSchema),
	delete: oc.route({
		method: "DELETE",
		path: "/custom-tables/{id}",
		summary: "Delete custom table",
		tags: ["Custom Tables"]
	}).input(CustomTableDeleteInputSchema).output(CustomTableDeleteOutputSchema)
};

//#endregion
//#region src/schemas/notebase-beta.ts
const NotebaseBetaStatusInputSchema = z.object({}).strict();
const NotebaseBetaStatusOutputSchema = z.object({ allowed: z.boolean() });

//#endregion
//#region src/contracts/notebase-beta.ts
const notebaseBetaContract = { status: oc.route({
	method: "GET",
	path: "/notebase-beta/status",
	summary: "Get Notebase beta access status",
	tags: ["Notebase Beta"]
}).input(NotebaseBetaStatusInputSchema).output(NotebaseBetaStatusOutputSchema) };

//#endregion
//#region src/schemas/row.ts
const RowAddInputSchema = z.object({
	tableId: z.uuid(),
	data: z.object({
		id: z.uuid().optional(),
		cells: z.record(z.string(), z.unknown()),
		position: z.number().int().optional()
	}).strict()
});
const RowAddOutputSchema = z.object({ txid: z.number() });
const RowUpdateInputSchema = z.object({
	rowId: z.uuid(),
	data: z.object({
		cells: z.record(z.string(), z.unknown()).optional(),
		position: z.number().int().optional()
	}).strict()
});
const RowUpdateOutputSchema = z.object({
	id: z.uuid(),
	tableId: z.uuid(),
	cells: z.record(z.string(), z.unknown()),
	position: z.number().int().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
	txid: z.number()
});
const RowDeleteInputSchema = z.object({ rowId: z.uuid() });
const RowDeleteOutputSchema = z.object({ txid: z.number() });

//#endregion
//#region src/contracts/row.ts
const rowContract = {
	add: oc.route({
		method: "POST",
		path: "/rows",
		summary: "Add row to table",
		tags: ["Rows"]
	}).input(RowAddInputSchema).output(RowAddOutputSchema),
	update: oc.route({
		method: "PATCH",
		path: "/rows/{rowId}",
		summary: "Update row cells",
		tags: ["Rows"]
	}).input(RowUpdateInputSchema).output(RowUpdateOutputSchema),
	delete: oc.route({
		method: "DELETE",
		path: "/rows/{rowId}",
		summary: "Delete row",
		tags: ["Rows"]
	}).input(RowDeleteInputSchema).output(RowDeleteOutputSchema)
};

//#endregion
//#region src/index.ts
const contract = {
	customTable: customTableContract,
	column: columnContract,
	row: rowContract,
	notebaseBeta: notebaseBetaContract
};

//#endregion
export { ColumnAddInputSchema, ColumnAddOutputSchema, ColumnDeleteInputSchema, ColumnDeleteOutputSchema, ColumnUpdateInputSchema, ColumnUpdateOutputSchema, CustomTableCreateInputSchema, CustomTableCreateOutputSchema, CustomTableDeleteInputSchema, CustomTableDeleteOutputSchema, CustomTableGetInputSchema, CustomTableGetOutputSchema, CustomTableGetSchemaInputSchema, CustomTableGetSchemaOutputSchema, CustomTableListInputSchema, CustomTableListItemSchema, CustomTableListOutputSchema, CustomTableUpdateInputSchema, CustomTableUpdateOutputSchema, NotebaseBetaStatusInputSchema, NotebaseBetaStatusOutputSchema, RowAddInputSchema, RowAddOutputSchema, RowDeleteInputSchema, RowDeleteOutputSchema, RowUpdateInputSchema, RowUpdateOutputSchema, TableColumnSchema, TableRowSchema, TableViewSchema, contract };
