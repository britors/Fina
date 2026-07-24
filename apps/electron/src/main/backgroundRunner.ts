import { app } from 'electron';
import { openDatabase, runMigrations, needsUnlock, closeDatabase } from './database';
import { generateRecurrences } from './recurrences';
import { checkAndNotify } from './notifications';
import { runAutoBackup } from './autobackup';

// Executa as mesmas tarefas que rodariam ao abrir o app (recorrências,
// notificações de contas/orçamento por nativa/e-mail/webhook, auto-backup
// agendado) e encerra — chamado quando o app é invocado com
// `--background-tasks` pelo timer do systemd (Linux) ou pela Tarefa
// Agendada do Windows, para funcionar mesmo com o app fechado.
export async function runBackgroundTasksAndExit(): Promise<void> {
  try {
    openDatabase();

    // Um banco criptografado exige a senha mestre, que só existe na tela de
    // desbloqueio interativa — não tem como pedir isso em segundo plano.
    // Só registra e sai; a próxima abertura normal do app continua pedindo
    // a senha como sempre.
    if (needsUnlock()) {
      console.log('[Background] Banco de dados criptografado — pulei esta execução (abra o app normalmente para destravar).');
      return;
    }

    runMigrations();
    generateRecurrences();
    checkAndNotify();
    runAutoBackup('scheduled');
  } catch (err) {
    console.error('[Background] Erro ao rodar tarefas em segundo plano:', err);
  } finally {
    closeDatabase();
    app.exit(0);
  }
}
