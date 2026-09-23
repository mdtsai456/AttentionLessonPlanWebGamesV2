"""比對兩個資料庫的 schema 差異：表清單、欄位、索引、外鍵。

背景：2026-09-22 發現正式庫（AttentionLessonPlan）跟測試庫
（AttentionLessonPlan_test）曾經走鐘——正式庫是帳密登入功能（ADR-0004）上線
「之前」建的，測試庫後來照最新 tests/schema.sql 重建過，兩邊分岔了一段時間
沒被發現（見 migrations/2026-09-22-add-login-feature-to-prod.sql）。

只做唯讀查詢（information_schema），不會修改任何資料或結構。

用法：
    uv run python diff_schema.py                    # 預設比對正式庫 vs 測試庫
    uv run python diff_schema.py SchemaA SchemaB     # 比對任意兩個 schema

建議時機：任何一次修改 tests/schema.sql、或對正式庫手動下過 DDL 之後，跑一次
確認兩邊沒有分岔。
"""

from __future__ import annotations

import sys

import pymysql

from db import get_db_config

DEFAULT_PROD = "AttentionLessonPlan"
DEFAULT_TEST = "AttentionLessonPlan_test"

_DIFF_COLUMNS = ("COLUMN_TYPE", "IS_NULLABLE", "COLUMN_KEY", "COLUMN_DEFAULT", "EXTRA")


def _fetch_columns(cur, schema: str) -> dict[str, dict[str, dict]]:
    cur.execute(
        """
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
               COLUMN_KEY, COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s
        ORDER BY TABLE_NAME, ORDINAL_POSITION
        """,
        (schema,),
    )
    by_table: dict[str, dict[str, dict]] = {}
    for row in cur.fetchall():
        by_table.setdefault(row["TABLE_NAME"], {})[row["COLUMN_NAME"]] = row
    return by_table


def _fetch_indexes(cur, schema: str) -> dict[str, set]:
    cur.execute(
        """
        SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = %s
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
        """,
        (schema,),
    )
    by_table: dict[str, set] = {}
    for row in cur.fetchall():
        by_table.setdefault(row["TABLE_NAME"], set()).add(
            (row["INDEX_NAME"], row["COLUMN_NAME"], row["NON_UNIQUE"])
        )
    return by_table


def _fetch_foreign_keys(cur, schema: str) -> dict[str, set]:
    cur.execute(
        """
        SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = %s AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY TABLE_NAME, CONSTRAINT_NAME
        """,
        (schema,),
    )
    by_table: dict[str, set] = {}
    for row in cur.fetchall():
        by_table.setdefault(row["TABLE_NAME"], set()).add(
            (row["COLUMN_NAME"], row["REFERENCED_TABLE_NAME"], row["REFERENCED_COLUMN_NAME"])
        )
    return by_table


def diff_schemas(schema_a: str, schema_b: str) -> bool:
    """回傳 True 代表完全一致；過程把差異印到 stdout。"""
    config = get_db_config()
    config.pop("database", None)
    conn = pymysql.connect(**config)
    try:
        with conn.cursor() as cur:
            cols_a, cols_b = _fetch_columns(cur, schema_a), _fetch_columns(cur, schema_b)
            idx_a, idx_b = _fetch_indexes(cur, schema_a), _fetch_indexes(cur, schema_b)
            fk_a, fk_b = _fetch_foreign_keys(cur, schema_a), _fetch_foreign_keys(cur, schema_b)
    finally:
        conn.close()

    tables_a, tables_b = set(cols_a), set(cols_b)
    print(f"{schema_a} 表數：{len(tables_a)}")
    print(f"{schema_b} 表數：{len(tables_b)}")

    only_a = tables_a - tables_b
    only_b = tables_b - tables_a
    common = tables_a & tables_b

    print(f"\n=== 只存在 {schema_a} 的表 ===")
    print(sorted(only_a) or "（無）")
    print(f"\n=== 只存在 {schema_b} 的表 ===")
    print(sorted(only_b) or "（無）")

    print("\n=== 兩邊都有的表，逐一比對欄位／索引／外鍵 ===")
    any_diff = False
    for table in sorted(common):
        a_cols, b_cols = cols_a[table], cols_b[table]
        a_names, b_names = set(a_cols), set(b_cols)

        col_only_a = a_names - b_names
        col_only_b = b_names - a_names
        changed = [
            (name, {f: (a_cols[name][f], b_cols[name][f]) for f in _DIFF_COLUMNS if a_cols[name][f] != b_cols[name][f]})
            for name in sorted(a_names & b_names)
            if any(a_cols[name][f] != b_cols[name][f] for f in _DIFF_COLUMNS)
        ]

        idx_only_a = idx_a.get(table, set()) - idx_b.get(table, set())
        idx_only_b = idx_b.get(table, set()) - idx_a.get(table, set())
        fk_only_a = fk_a.get(table, set()) - fk_b.get(table, set())
        fk_only_b = fk_b.get(table, set()) - fk_a.get(table, set())

        if not any([col_only_a, col_only_b, changed, idx_only_a, idx_only_b, fk_only_a, fk_only_b]):
            continue

        any_diff = True
        print(f"\n--- {table} ---")
        if col_only_a:
            print(f"  只在 {schema_a} 的欄位：", sorted(col_only_a))
        if col_only_b:
            print(f"  只在 {schema_b} 的欄位：", sorted(col_only_b))
        for name, diffs in changed:
            print(f"  欄位 {name} 定義不同：")
            for field, (va, vb) in diffs.items():
                print(f"    {field}: {schema_a}={va!r} {schema_b}={vb!r}")
        if idx_only_a:
            print(f"  只在 {schema_a} 的索引：", sorted(idx_only_a))
        if idx_only_b:
            print(f"  只在 {schema_b} 的索引：", sorted(idx_only_b))
        if fk_only_a:
            print(f"  只在 {schema_a} 的外鍵：", sorted(fk_only_a))
        if fk_only_b:
            print(f"  只在 {schema_b} 的外鍵：", sorted(fk_only_b))

    is_identical = not any_diff and not only_a and not only_b
    print("\n（兩邊 schema 完全一致）" if is_identical else "\n（以上為全部差異）")
    return is_identical


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass  # 極舊版 Python 沒有 reconfigure，退回預設編碼即可。

    schema_a = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PROD
    schema_b = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_TEST
    identical = diff_schemas(schema_a, schema_b)
    sys.exit(0 if identical else 1)


if __name__ == "__main__":
    main()
