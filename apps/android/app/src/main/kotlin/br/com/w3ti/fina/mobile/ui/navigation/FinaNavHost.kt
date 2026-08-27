package br.com.w3ti.fina.mobile.ui.navigation

import androidx.compose.runtime.Composable
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
            )
        }
        composable(Routes.NEW_TRANSACTION) {
            val viewModel: TransactionsViewModel = viewModel(factory = viewModelFactory)
            NewTransactionScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.SYNC) {
            val viewModel: PairingViewModel = viewModel(factory = viewModelFactory)
            PairingScreen(viewModel = viewModel, onDone = { navController.popBackStack() })
        }
    }
}
