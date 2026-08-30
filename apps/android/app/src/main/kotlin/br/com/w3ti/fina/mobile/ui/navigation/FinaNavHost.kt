package br.com.w3ti.fina.mobile.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import br.com.w3ti.fina.mobile.ui.common.ViewModelFactory
import br.com.w3ti.fina.mobile.ui.pairing.PairingScreen
import br.com.w3ti.fina.mobile.ui.pairing.PairingViewModel
import br.com.w3ti.fina.mobile.ui.transactions.NewTransactionScreen
import br.com.w3ti.fina.mobile.ui.transactions.TransactionsScreen
import br.com.w3ti.fina.mobile.ui.transactions.TransactionsViewModel

private object Routes {
    const val HOME = "home"
    const val NEW_TRANSACTION = "new_transaction"
    const val EDIT_TRANSACTION = "edit_transaction/{clientId}"
    const val SYNC = "sync"
}

@Composable
fun FinaNavHost(viewModelFactory: ViewModelFactory, navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            val viewModel: TransactionsViewModel = viewModel(factory = viewModelFactory)
            TransactionsScreen(
                viewModel = viewModel,
                onNewTransaction = { navController.navigate(Routes.NEW_TRANSACTION) },
                onSync = { navController.navigate(Routes.SYNC) },
                onEditTransaction = { clientId -> navController.navigate("edit_transaction/$clientId") },
            )
        }
        composable(Routes.NEW_TRANSACTION) { entry ->
            val owner = remember(entry) { navController.getBackStackEntry(Routes.HOME) }
            val viewModel: TransactionsViewModel = viewModel(viewModelStoreOwner = owner, factory = viewModelFactory)
            NewTransactionScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.EDIT_TRANSACTION) { entry ->
            val owner = remember(entry) { navController.getBackStackEntry(Routes.HOME) }
            val viewModel: TransactionsViewModel = viewModel(viewModelStoreOwner = owner, factory = viewModelFactory)
            val transaction = entry.arguments?.getString("clientId")?.let(viewModel::transaction)
            if (transaction == null) {
                androidx.compose.runtime.LaunchedEffect(Unit) { navController.popBackStack() }
            } else {
                NewTransactionScreen(viewModel = viewModel, editing = transaction, onBack = { navController.popBackStack() })
            }
        }
        composable(Routes.SYNC) {
            val viewModel: PairingViewModel = viewModel(factory = viewModelFactory)
            PairingScreen(viewModel = viewModel, onDone = { navController.popBackStack() })
        }
    }
}
