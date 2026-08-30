package br.com.w3ti.fina.mobile.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import java.io.File
import java.io.FileInputStream

@Database(
    entities = [AccountEntity::class, CategoryEntity::class, PendingTransactionEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun pendingTransactionDao(): PendingTransactionDao

    companion object {
        private const val DATABASE_NAME = "fina-mobile.db"
        private val SQLITE_HEADER = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)
        @Volatile private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: buildEncrypted(context.applicationContext)
                .also { instance = it }
        }

        private fun buildEncrypted(context: Context): AppDatabase {
            System.loadLibrary("sqlcipher")
            val passphrase = DatabaseKeyStore(context).getOrCreatePassphrase()
            val databaseFile = context.getDatabasePath(DATABASE_NAME)
            val plaintext = hasPlaintextHeader(databaseFile)
            val snapshot = if (plaintext) readPlaintextSnapshot(databaseFile) else null
            val backup = if (plaintext) movePlaintextAside(databaseFile) else null

            try {
                val database = Room.databaseBuilder(context, AppDatabase::class.java, DATABASE_NAME)
                    .openHelperFactory(SupportOpenHelperFactory(passphrase))
                    .build()
                // Room abre sob demanda, mas a factory conserva esta mesma
                // ByteArray. Abra agora antes de zerá-la no finally.
                database.openHelper.writableDatabase
                if (snapshot != null) restoreSnapshot(database, snapshot)
                backup?.deleteRecursively()
                return database
            } catch (error: Throwable) {
                // Só há arquivo descartável quando esta execução estava
                // migrando um SQLite em texto claro e manteve o original no
                // diretório de backup. Se um banco já cifrado não abrir (por
                // exemplo, Keystore indisponível), jamais o apague.
                if (backup != null) {
                    databaseFile.delete()
                    File(databaseFile.path + "-wal").delete()
                    File(databaseFile.path + "-shm").delete()
                    restorePlaintextBackup(databaseFile, backup)
                }
                throw error
            } finally {
                passphrase.fill(0)
            }
        }

        internal fun hasPlaintextHeader(file: File): Boolean {
            if (!file.isFile || file.length() < SQLITE_HEADER.size) return false
            return FileInputStream(file).use { input ->
                val header = ByteArray(SQLITE_HEADER.size)
                input.read(header) == header.size && header.contentEquals(SQLITE_HEADER)
            }
        }

        private data class Snapshot(
            val accounts: List<Array<Any?>>,
            val categories: List<Array<Any?>>,
            val pending: List<Array<Any?>>,
        )

        private fun readPlaintextSnapshot(file: File): Snapshot {
            val db = android.database.sqlite.SQLiteDatabase.openDatabase(file.path, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY)
            return try {
                Snapshot(
                    accounts = db.rows("SELECT id,name,type FROM cached_accounts", 3),
                    categories = db.rows("SELECT id,name,parentId,kind FROM cached_categories", 4),
                    pending = db.rows("SELECT clientId,accountId,categoryId,description,amount,type,date,notes,createdAt,syncStatus,rejectionReason FROM pending_transactions", 11),
                )
            } finally {
                db.close()
            }
        }

        private fun android.database.sqlite.SQLiteDatabase.rows(sql: String, count: Int): List<Array<Any?>> =
            rawQuery(sql, null).use { cursor ->
                buildList {
                    while (cursor.moveToNext()) {
                        add(Array(count) { index ->
                            when (cursor.getType(index)) {
                                android.database.Cursor.FIELD_TYPE_NULL -> null
                                android.database.Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(index)
                                android.database.Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(index)
                                android.database.Cursor.FIELD_TYPE_BLOB -> cursor.getBlob(index)
                                else -> cursor.getString(index)
                            }
                        })
                    }
                }
            }

        private fun movePlaintextAside(file: File): File {
            val dir = File(file.parentFile, "${file.name}.plaintext-backup")
            dir.deleteRecursively()
            check(dir.mkdir()) { "Não foi possível preparar a migração segura do banco." }
            val moved = mutableListOf<Pair<File, File>>()
            try {
                for (suffix in listOf("", "-wal", "-shm")) {
                    val source = File(file.path + suffix)
                    if (!source.exists()) continue
                    val target = File(dir, file.name + suffix)
                    check(source.renameTo(target)) { "Não foi possível proteger o banco antigo." }
                    moved += source to target
                }
            } catch (error: Throwable) {
                for ((original, backup) in moved.asReversed()) {
                    if (backup.exists()) backup.renameTo(original)
                }
                dir.deleteRecursively()
                throw error
            }
            return dir
        }

        private fun restorePlaintextBackup(file: File, backup: File) {
            for (suffix in listOf("", "-wal", "-shm")) {
                val source = File(backup, file.name + suffix)
                if (source.exists()) check(source.renameTo(File(file.path + suffix))) {
                    "Não foi possível restaurar o banco anterior após a falha de migração."
                }
            }
            backup.deleteRecursively()
        }

        private fun restoreSnapshot(database: AppDatabase, snapshot: Snapshot) {
            val db = database.openHelper.writableDatabase
            db.beginTransaction()
            try {
                snapshot.accounts.forEach { db.execSQL("INSERT INTO cached_accounts(id,name,type) VALUES(?,?,?)", it) }
                snapshot.categories.forEach { db.execSQL("INSERT INTO cached_categories(id,name,parentId,kind) VALUES(?,?,?,?)", it) }
                snapshot.pending.forEach {
                    db.execSQL("INSERT INTO pending_transactions(clientId,accountId,categoryId,description,amount,type,date,notes,createdAt,syncStatus,rejectionReason) VALUES(?,?,?,?,?,?,?,?,?,?,?)", it)
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
    }
}
