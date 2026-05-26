// PDF renderer para la vista publica de liquidacion (un solo item /
// unidad). Usa @react-pdf/renderer (pure JS, sin chromium). Se monta
// en runtime node desde un route handler.

import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { PublicLiquidationView } from '@/lib/iadmin/public-liquidation'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDateAr(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  return `${m[3]}/${m[2]}/${m[1]}`
}

const NAVY = '#112250'
const DARK = '#1A1A1A'
const MUTED = '#666666'
const BORDER = '#E2E2E2'
const SOFT_BG = '#FAFAFA'
const SAND = '#FFF8EC'
const SAND_BORDER = '#F2DBA8'

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: DARK,
  },
  headerBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  brandLabel: {
    fontSize: 8,
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
  },
  propertyName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  propertyAddress: { fontSize: 9, color: MUTED },
  metaRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  metaCell: {
    flex: 1,
    backgroundColor: SOFT_BG,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  metaLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: MUTED,
    marginBottom: 2,
  },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  amountHero: {
    backgroundColor: SAND,
    borderWidth: 1,
    borderColor: SAND_BORDER,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  amountHeroPaid: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  amountHeroLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 4,
  },
  amountHeroValue: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    marginTop: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: SOFT_BG,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: MUTED,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  col: { flex: 1 },
  colRight: { flex: 1, textAlign: 'right' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  detailLabel: { color: MUTED, fontSize: 9 },
  detailValue: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  bankBlock: {
    backgroundColor: SOFT_BG,
    borderRadius: 4,
    padding: 10,
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    textAlign: 'center',
    fontSize: 7,
    color: MUTED,
  },
})

export function PublicLiquidationPdf({ view }: { view: PublicLiquidationView }) {
  const monthLabel = MONTH_NAMES[view.periodMonth - 1] ?? ''
  const isPaid = view.balanceRemaining < 0.01 && view.subtotal > 0
  const bank = view.legalInfo.bank

  return (
    <Document
      title={`Liquidacion ${view.propertyName} ${view.unitCode} ${monthLabel} ${view.periodYear}`}
      author="Countrify"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerBox}>
          <Text style={styles.brandLabel}>Liquidación de expensas</Text>
          <Text style={styles.propertyName}>{view.propertyName}</Text>
          <Text style={styles.propertyAddress}>{view.propertyAddress}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Período</Text>
              <Text style={styles.metaValue}>{monthLabel} {view.periodYear}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Unidad</Text>
              <Text style={styles.metaValue}>
                {view.unitCode}{view.holderName ? ` · ${view.holderName}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Monto destacado */}
        <View style={isPaid ? styles.amountHeroPaid : styles.amountHero}>
          <Text style={styles.amountHeroLabel}>
            {isPaid ? 'Mes al día' : 'A pagar'}
          </Text>
          <Text style={styles.amountHeroValue}>
            {isPaid ? formatARS(view.subtotal) : formatARS(view.balanceRemaining)}
          </Text>
          {!isPaid && view.collectedAmount > 0 ? (
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
              Subtotal {formatARS(view.subtotal)} · Cobrado {formatARS(view.collectedAmount)}
            </Text>
          ) : null}
        </View>

        {/* Desglose */}
        <Text style={styles.sectionTitle}>Detalle del período</Text>
        <View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expensas ordinarias</Text>
            <Text style={styles.detailValue}>{formatARS(view.ordinaryAmount)}</Text>
          </View>
          {view.extraordinaryAmount > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Expensas extraordinarias</Text>
              <Text style={styles.detailValue}>{formatARS(view.extraordinaryAmount)}</Text>
            </View>
          ) : null}
          {view.previousBalance > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Saldo anterior</Text>
              <Text style={styles.detailValue}>{formatARS(view.previousBalance)}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { fontFamily: 'Helvetica-Bold', color: DARK }]}>
              Subtotal
            </Text>
            <Text style={styles.detailValue}>{formatARS(view.subtotal)}</Text>
          </View>
          {view.collectedAmount > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Cobrado</Text>
              <Text style={styles.detailValue}>−{formatARS(view.collectedAmount)}</Text>
            </View>
          ) : null}
        </View>

        {/* Vencimientos */}
        {view.dueDates.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Vencimientos</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.col}>Vencimiento</Text>
                <Text style={styles.col}>Fecha</Text>
                <Text style={styles.colRight}>Recargo</Text>
                <Text style={styles.colRight}>Monto</Text>
              </View>
              {view.dueDates.map((d, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={styles.col}>{d.label}</Text>
                  <Text style={styles.col}>{formatDateAr(d.date)}</Text>
                  <Text style={styles.colRight}>
                    {d.surchargePct > 0 ? `+${d.surchargePct}%` : '—'}
                  </Text>
                  <Text style={styles.colRight}>{formatARS(d.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Pagos recientes */}
        {view.recentPayments.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Pagos registrados</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.col}>Recibo</Text>
                <Text style={styles.col}>Fecha</Text>
                <Text style={styles.col}>Método</Text>
                <Text style={styles.colRight}>Monto</Text>
              </View>
              {view.recentPayments.map((p, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={styles.col}>{p.receiptNumber ?? '—'}</Text>
                  <Text style={styles.col}>{formatDateAr(p.paidAt.slice(0, 10))}</Text>
                  <Text style={styles.col}>{p.method ?? '—'}</Text>
                  <Text style={styles.colRight}>{formatARS(p.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Datos bancarios */}
        {bank && (bank.name || bank.cbu || bank.alias || bank.account) ? (
          <>
            <Text style={styles.sectionTitle}>Cómo pagar</Text>
            <View style={styles.bankBlock}>
              {bank.name ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Banco</Text>
                  <Text style={styles.detailValue}>{bank.name}</Text>
                </View>
              ) : null}
              {bank.cbu ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>CBU</Text>
                  <Text style={styles.detailValue}>{bank.cbu}</Text>
                </View>
              ) : null}
              {bank.alias ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Alias</Text>
                  <Text style={styles.detailValue}>{bank.alias}</Text>
                </View>
              ) : null}
              {bank.account ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Cuenta</Text>
                  <Text style={styles.detailValue}>{bank.account}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Contacto */}
        {view.legalInfo.accountantName || view.legalInfo.accountantPhone ? (
          <>
            <Text style={styles.sectionTitle}>Consultas</Text>
            <Text style={{ fontSize: 9, color: MUTED }}>
              {[view.legalInfo.accountantName, view.legalInfo.accountantPhone].filter(Boolean).join(' · ')}
            </Text>
          </>
        ) : null}

        <Text style={styles.footer} fixed>
          Countrify · Liquidación generada automáticamente
        </Text>
      </Page>
    </Document>
  )
}
