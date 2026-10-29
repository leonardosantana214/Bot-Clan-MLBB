import { GroupsScreen } from './GroupsScreen';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'qrcode';
import { AeroMark } from '../components/AeroBrand';
import { Button, Card, Badge, ConfirmModal, EmptyState } from '../components';
import type { ControllerApi, WhatsAppConnection, WhatsAppGroup } from '../services/api';
import { borders, colors, spacing, typography } from '../theme';

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
      } catch { if (active) { setImage(null); setConnection(null); setError('Host inacessível: ele pode não estar rodando ou o endereço está errado.'); } }
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
    catch { setError('Não foi possível conectar. Confira se o Host está rodando e se o endereço está correto.'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.container}>
    <Card title="Conexão" subtitle="WHATSAPP · CANAL PRIVADO">
      {connection?.demonstration ? <Badge label="DEMONSTRAÇÃO" tone="info" /> : null}
      <Text style={styles.text}>Use um NÚMERO DE TESTE. Quem escaneia o QR dá ao bot controle da conta. Não compartilhe o QR.</Text>
      <Text style={styles.text}>Estado: {connection?.state ?? 'Consultando'}</Text>
      {connection?.state === 'conectado' ? <Text style={styles.text}>{connection.botName} {connection.botNumber}</Text> : null}

      <View style={styles.qrFrame}>
        {image ? <Image accessibilityLabel="QR privado de pareamento WhatsApp" source={{ uri: image }} style={styles.qrImage} /> : <View style={styles.qrWaiting}><AeroMark size={64}/><Text style={styles.waitTitle}>{connection?.state === 'conectado' ? 'Canal estabelecido' : 'Aguardando pareamento'}</Text><Text style={styles.waitNote}>{connection?.demonstration ? 'QR fictício · demonstração não escaneável' : 'O QR privado aparecerá aqui quando disponível.'}</Text></View>}
        <View style={[styles.corner, styles.topLeft]}/><View style={[styles.corner, styles.topRight]}/><View style={[styles.corner, styles.bottomLeft]}/><View style={[styles.corner, styles.bottomRight]}/>
      </View>
      {expiresAt ? <Text style={styles.text}>Expiração aproximada: {new Date(expiresAt).toLocaleTimeString('pt-BR')}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : null}
      <Button label="Gerar novo QR" disabled={busy} onPress={() => { void action(false); }} />
      <Button style={{ marginTop: spacing.lg }} label="Desconectar" variant="danger" disabled={busy} onPress={() => setConfirm(true)} />
    </Card>
    <ConfirmModal visible={confirm} title="Desconectar WhatsApp?" description="A sessão será encerrada e as credenciais locais serão apagadas. Será necessário parear novamente." confirmLabel="Desconectar" destructive onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void action(true); }} />
  </ScrollView>;
}

export function WhatsAppGroupsScreen({ api, demo }: { api: ControllerApi; demo: boolean }): React.JSX.Element {
  const [modules, setModules] = useState(false);
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
  if(modules) return <View style={{flex:1}}><Button label="Voltar aos papéis" variant="outline" onPress={()=>setModules(false)}/><GroupsScreen api={api} refreshSignal={0}/></View>;
  return <ScrollView contentContainerStyle={styles.container}>
    <Button label="Módulos e atividade por grupo" onPress={()=>setModules(true)}/>
    <Text style={styles.heading}>Grupos</Text>{demo ? <Badge label="DEMONSTRAÇÃO" tone="info" /> : null}<Text style={styles.text}>CHAT e ADM devem ser distintos. Comandos administrativos só funcionam na rota ADM.</Text>
    {!groups.length ? <EmptyState title="Nenhum grupo" description="Conecte o bot e adicione-o aos grupos de teste para definir os papéis." /> : null}
    {groups.map(group => <Card key={group.id} title={group.name}><Text style={styles.text}>{group.id}</Text><View>
      <Button variant="outline" label="Definir como CHAT" disabled={busy} onPress={() => { void assign(group.id, 'chatGroupId'); }} />
      <Button label="Definir como ADM" variant="outline" disabled={busy} onPress={() => { void assign(group.id, 'adminGroupId'); }} />
    </View></Card>)}
    {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.xl },
  text: { color: colors.textSecondary, fontFamily: typography.families.ui, fontSize: typography.sizes.bodyCompact, lineHeight: 21, marginBottom: spacing.sm },
  heading: { color: colors.textPrimary, fontFamily: typography.families.display, fontSize: typography.sizes.heading },
  qrFrame: { alignSelf: 'center', width: '100%', maxWidth: 288, aspectRatio: 1, padding: spacing.sm, marginVertical: spacing.xl, borderWidth: borders.hairline, borderColor: colors.border, position: 'relative' },
  qrImage: { width: '100%', height: '100%', backgroundColor: colors.qrPaper },
  qrWaiting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  waitTitle: { color: colors.gold, fontFamily: typography.families.display, fontSize: typography.sizes.section, textAlign: 'center' },
  waitNote: { color: colors.textMuted, fontFamily: typography.families.ui, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: colors.gold },
  topLeft: { top: -1, left: -1, borderTopWidth: borders.focus, borderLeftWidth: borders.focus },
  topRight: { top: -1, right: -1, borderTopWidth: borders.focus, borderRightWidth: borders.focus },
  bottomLeft: { bottom: -1, left: -1, borderBottomWidth: borders.focus, borderLeftWidth: borders.focus },
  bottomRight: { bottom: -1, right: -1, borderBottomWidth: borders.focus, borderRightWidth: borders.focus }
});
