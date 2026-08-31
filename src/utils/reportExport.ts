import { Share, Alert } from 'react-native';
import type { DeliveryEntity, DeliveryListEntity } from '../types/geo';

const REASON_LABELS: Record<string, string> = {
  absent: 'Ausente / Não atendeu',
  refused: 'Recusou a entrega',
  wrong_address: 'Endereço errado',
  no_access: 'Sem acesso ao local',
  other: 'Outro motivo',
};

/**
 * Gera um texto formatado profissional do resumo da rota de entregas.
 */
export function formatDeliveryReportText(
  listName: string,
  deliveries: DeliveryEntity[],
): string {
  const total = deliveries.length;
  const completed = deliveries.filter((d) => d.status === 'completed');
  const failed = deliveries.filter((d) => d.status === 'failed');
  const pending = deliveries.filter(
    (d) => d.status === 'pending' || d.status === 'optimized' || d.status === 'in_progress',
  );

  const pctCompleted = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  const dateStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let text = `📦 *RELATÓRIO DE ENTREGAS — RotaSimples*\n`;
  text += `📅 Data/Hora: ${dateStr}\n`;
  text += `📋 Romaneio / Lista: *${listName || 'Lista Atual'}*\n`;
  text += `───────────────────────\n`;
  text += `📊 *RESUMO GERAL:*\n`;
  text += `• Total de Entregas: ${total}\n`;
  text += `• Concluídas com Sucesso: ${completed.length} (${pctCompleted}%)\n`;
  text += `• Pendentes: ${pending.length}\n`;
  text += `• Insucessos / Não Entregues: ${failed.length}\n\n`;

  if (failed.length > 0) {
    text += `❌ *ENTREGAS COM INSUCESSO (${failed.length}):*\n`;
    failed.forEach((d, i) => {
      const reason = d.failReason ? REASON_LABELS[d.failReason] || d.failReason : 'Não informado';
      const order = d.ordem ?? d.sequence ?? i + 1;
      text += `${i + 1}. [Parada #${order}] ${d.destination || d.name}\n`;
      text += `   Motivo: ${reason}${d.notes ? ` (${d.notes})` : ''}\n`;
    });
    text += `\n`;
  }

  if (completed.length > 0) {
    text += `✅ *ENTREGAS CONCLUÍDAS (${completed.length}):*\n`;
    completed.forEach((d, i) => {
      const order = d.ordem ?? d.sequence ?? i + 1;
      const timeStr = d.deliveredAt
        ? new Date(d.deliveredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '—';
      text += `${i + 1}. [Parada #${order}] ${d.destination || d.name} (Hora: ${timeStr})${d.notes ? ` [Obs: ${d.notes}]` : ''}\n`;
    });
  }

  return text;
}

/**
 * Abre o modal nativo de compartilhamento do dispositivo (WhatsApp, e-mail, etc.).
 */
export async function shareDeliveryReport(
  listName: string,
  deliveries: DeliveryEntity[],
): Promise<void> {
  if (deliveries.length === 0) {
    Alert.alert('Sem Dados', 'Não há entregas para gerar o relatório.');
    return;
  }

  try {
    const message = formatDeliveryReportText(listName, deliveries);
    await Share.share({
      title: `Relatório de Entregas - ${listName}`,
      message,
    });
  } catch (error: any) {
    if (error?.message && !error.message.includes('dismissed')) {
      Alert.alert('Erro', 'Não foi possível compartilhar o relatório.');
    }
  }
}
