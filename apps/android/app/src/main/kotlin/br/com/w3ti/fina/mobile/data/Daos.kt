package br.com.w3ti.fina.mobile.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface AccountDao {
    @Query("SELECT * FROM cached_accounts ORDER BY name")
    fun observeAll(): Flow<List<AccountEntity>>

    @Transaction
    suspend fun replaceAll(accounts: List<AccountEntity>) {
        deleteAll()
        insertAll(accounts)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(accounts: List<AccountEntity>)

    @Query("DELETE FROM cached_accounts")
    suspend fun deleteAll()
}

@Dao
interface CategoryDao {
    @Query("SELECT * FROM cached_categories ORDER BY name")
    fun observeAll(): Flow<List<CategoryEntity>>

    @Transaction
    suspend fun replaceAll(categories: List<CategoryEntity>) {
        deleteAll()
        insertAll(categories)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(categories: List<CategoryEntity>)

    @Query("DELETE FROM cached_categories")
    suspend fun deleteAll()
}

@Dao
interface PendingTransactionDao {
    @Query("SELECT * FROM pending_transactions ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<PendingTransactionEntity>>

    @Query("SELECT * FROM pending_transactions WHERE syncStatus = 'PENDING' ORDER BY createdAt")
    suspend fun getPending(): List<PendingTransactionEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(transaction: PendingTransactionEntity)

    @Update
    suspend fun update(transaction: PendingTransactionEntity)

    @Query("DELETE FROM pending_transactions WHERE clientId = :clientId")
    suspend fun delete(clientId: String)
}
