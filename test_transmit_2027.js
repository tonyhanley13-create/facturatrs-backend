const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dgiiService = require('./dist/services/dgii.service');
const { ECF, Signature, Transformer } = require('dgii-ecf');

async function testDate(expDate) {
  console.log(`=== Testing Expiration Date: ${expDate} ===`);
  try {
    const companyId = 1;
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      console.log('Company not found');
      return;
    }

    // Usar la secuencia 104 para la prueba
    const encfNumber = 'E310000000104';
    const rncEmisor = company.rnc;
    const rncComprador = '00100129758'; // Leandro Gonzalez
    const todayStr = '07-07-2026';

    const idDoc = {
      TipoeCF: 31,
      eNCF: encfNumber,
      FechaVencimientoSecuencia: expDate,
      IndicadorMontoGravado: 2, // Exento para simplificar
      TipoIngresos: '01',
      TipoPago: 1,
      TotalPaginas: 1
    };

    const ecfBody = {
      Encabezado: {
        Version: '1.0',
        IdDoc: idDoc,
        Emisor: {
          RNCEmisor: rncEmisor.replace(/-/g, ''),
          RazonSocialEmisor: company.name.substring(0, 80),
          DireccionEmisor: (company.address || 'CALLE PRINCIPAL #1').substring(0, 70),
          FechaEmision: todayStr,
        },
        Comprador: {
          RNCComprador: rncComprador.replace(/-/g, ''),
          RazonSocialComprador: 'LEANDRO RAFAEL GONZALEZ MEJIA',
        },
        Totales: {
          MontoExento: 8000,
          MontoTotal: 8000
        },
      },
      DetallesItems: {
        Item: {
          NumeroLinea: '1',
          IndicadorFacturacion: 4,
          NombreItem: 'TRANSPORTE ZONA ESTE TEST',
          IndicadorBienoServicio: 2,
          CantidadItem: 1,
          PrecioUnitarioItem: 8000,
          MontoItem: 8000,
        }
      },
      Paginacion: {
        Pagina: {
          PaginaNo: 1,
          NoLineaDesde: 1,
          NoLineaHasta: 1,
          SubtotalMontoGravadoPagina: 0,
          SubtotalMontoGravado1Pagina: 0,
          SubtotalExentoPagina: 8000,
          SubtotalItbisPagina: 0,
          SubtotalItbis1Pagina: 0,
          MontoSubtotalPagina: 8000,
          SubtotalMontoNoFacturablePagina: 0
        }
      },
      FechaHoraFirma: '07-07-2026 12:00:00'
    };

    const transformer = new Transformer();
    const xml = transformer.json2xml({ ECF: ecfBody });

    const certs = await dgiiService.loadCertificate(companyId);
    const signature = new Signature(certs.key, certs.cert);
    const signedXml = signature.signXml(xml, 'ECF');

    const ecf = new ECF(certs, 'TesteCF');
    await ecf.authenticate();

    const fileName = `${rncEmisor}${encfNumber}.xml`;
    console.log('Sending to DGII...');
    const response = await ecf.sendElectronicDocument(signedXml, fileName);
    console.log('=== Response ===');
    console.log(JSON.stringify(response, null, 2));

    // Esperar unos segundos y consultar estado
    console.log('Waiting 5s before checking status...');
    await new Promise(r => setTimeout(r, 5000));
    
    const result = await dgiiService.checkStatus(response.trackId, companyId, 'Test');
    console.log('=== DGII Status Result ===');
    console.log(JSON.stringify(result, null, 2));

  } catch (e) {
    console.error('Error during test:', e);
  }
}

async function run() {
  await testDate('31-12-2027');
  await prisma.$disconnect();
}

run();
