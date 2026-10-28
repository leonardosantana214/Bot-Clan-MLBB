import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'qrcode';
import { Button, Card, ConfirmModal } from '../components';
import type { ControllerApi, WhatsAppConnection, WhatsAppGroup } from '../services/api';
import { colors, spacing } from '../theme';

export function ConnectionScreen({ api }: { api: ControllerApi }): React.JSX.Element {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 180_000;
    const poll = async () => {
      try {
        const state = await api.getConnection();
        if (!active) return;
        setConnection(state); setError('');
        if (state.state === 'conectado') return;
        if (Date.now() < deadline) timer = setTimeout(() => { void poll(); }, 2500);
        else { setConnection(null); setError('Tempo de pareamento esgotado. Gere um novo QR.'); }
      } catch (e) { if (active) { setImage(null); setConnection(null); setError(e instanceof Error ? e.message : 'Falha ao consultar conexão.'); } }
    };
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [api, revision, busy]);
  const qr = connection?.state === 'aguardando_qr' ? connection.qr : undefined;
  const expiresAt = connection?.state === 'aguardando_qr' ? connection.expiresAt : undefined;
  useEffect(() => {
    let active = true;
    setImage(null);
    if (!qr || !expiresAt || connection?.demonstration) return;
    const timer = setTimeout(() => {
      active = false; setImage(null);
      setConnection(current => current?.state === 'aguardando_qr' && current.expiresAt === expiresAt ? { state: 'conectando' } : current);
    }, Math.max(0, expiresAt - Date.now()));
    // Local SVG generation only. Never send the secret to an image service.
    void QRCode.toString(qr, { type: 'svg', margin: 4 }).then(svg => {
      if (active && Date.now() < expiresAt) setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    }).catch(() => { if (active) setError('Não foi possível renderizar o QR.'); });
    return () => { active = false; clearTimeout(timer); };
  }, [qr, expiresAt, connection?.demonstration]);
  const action = async (disconnect: boolean) => {
    setBusy(true); setImage(null); setConnection(null); setError('');
    try { if (disconnect) await api.disconnectSession(true); else await api.startPairing(); setRevision(r => r + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha na conexão.'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.container}>
    <Card>
      <Text style={styles.text}>Conexão WhatsApp{connection?.demonstration ? ' — DEMONSTRAÇÃO' : ''}</Text>
      <Text style={styles.text}>Use um NÚMERO DE TESTE. Quem escaneia o QR dá ao bot controle da conta. Não compartilhe o QR.</Text>
      <Text style={styles.text}>Estado: {connection?.state ?? 'Consultando'}</Text>
      {connection?.state === 'conectado' ? <Text style={styles.text}>{connection.botName} {connection.botNumber}</Text> : null}
      {connection?.demonstration && connection.state === 'aguardando_qr' ? <Text style={styles.text}>[QR FICTÍCIO — DEMONSTRAÇÃO — NÃO ESCANEÁVEL]</Text> : null}
      {image ? <Image accessibilityLabel="QR privado de pareamento WhatsApp" source={{ uri: image }} style={{ width: 280, height: 280 }} /> : null}
      {expiresAt ? <Text style={styles.text}>Expiração aproximada: {new Date(expiresAt).toLocaleTimeString('pt-BR')}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : null}
      <Button label="Gerar novo QR" disabled={busy} onPress={() => { void action(false); }} />
      <Button label="Desconectar" variant="danger" disabled={busy} onPress={() => setConfirm(true)} />
    </Card>
    <ConfirmModal visible={confirm} title="Desconectar WhatsApp?" description="A sessão será encerrada e as credenciais locais serão apagadas. Será necessário parear novamente." confirmLabel="Desconectar" destructive onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void action(true); }} />
  </ScrollView>;
}

export function WhatsAppGroupsScreen({ api, demo }: { api: ControllerApi; demo: boolean }): React.JSX.Element {
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api.listWhatsAppGroups().then(value => { if (active) setGroups(value); }).catch(e => { if (active) setMessage(e instanceof Error ? e.message : 'Falha ao listar grupos.'); });
    return () => { active = false; };
  }, [api]);
  const assign = async (id: string, role: 'chatGroupId' | 'adminGroupId') => {
    setBusy(true);
    try { setMessage((await api.setGroupRoles({ [role]: id })).message); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Falha ao salvar papéis.'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.text}>Grupos do bot{demo ? ' — DEMONSTRAÇÃO' : ''}. CHAT e ADM devem ser distintos. Comandos administrativos só funcionam na rota ADM.</Text>
    {!groups.length ? <Text style={styles.text}>Nenhum grupo disponível. Conecte o bot e entre nos grupos de teste.</Text> : null}
    {groups.map(group => <Card key={group.id}><Text style={styles.text}>{group.name}</Text><Text style={styles.text}>{group.id}</Text><View>
      <Button label="Definir como CHAT" disabled={busy} onPress={() => { void assign(group.id, 'chatGroupId'); }} />
      <Button label="Definir como ADM" disabled={busy} onPress={() => { void assign(group.id, 'adminGroupId'); }} />
    </View></Card>)}
    {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({ container: { gap: spacing.md, paddingBottom: spacing.md }, text: { color: colors.textPrimary, marginBottom: spacing.sm } });
