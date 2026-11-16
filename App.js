import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Share, StatusBar, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';

const STORAGE_KEY = '@cronicas_do_mestre_registros_v1';
const TIPOS = ['NPC', 'Lugar', 'Sessão'];
const FILTROS = ['Todos', ...TIPOS];
const DADOS = [4, 6, 8, 10, 12, 20];
// Ignora maiúsculas e acentos ao procurar pelo nome ou descrição de um registro.
function normalizarTexto(texto = '') {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
const PALETA = {
  fundo: '#100E18', painel: '#1F1B2B', painelClaro: '#2B2539',
  borda: '#413750', ouro: '#E8BF73', texto: '#F8F1E6',
  suave: '#C4BACD', perigo: '#F19A9A',
};

function Botao({ texto, aoClicar, secundario = false, perigo = false, desativado = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={desativado}
      onPress={aoClicar}
      style={({ pressed }) => [
        estilos.botao,
        secundario ? estilos.botaoSecundario : estilos.botaoPrimario,
        perigo && estilos.botaoPerigo,
        (pressed || desativado) && { opacity: 0.58 },
      ]}
    >
      <Text style={[estilos.botaoTexto, secundario && estilos.botaoSecundarioTexto, perigo && { color: PALETA.perigo }]}>
        {texto}
      </Text>
    </Pressable>
  );
}

function Etiquetas({ opcoes, selecionado, aoSelecionar }) {
  return (
    <View style={estilos.linhaEtiquetas}>
      {opcoes.map(opcao => (
        <Pressable
          key={opcao}
          accessibilityRole="button"
          onPress={() => aoSelecionar(opcao)}
          style={[estilos.etiqueta, selecionado === opcao && estilos.etiquetaAtiva]}
        >
          <Text style={[estilos.etiquetaTexto, selecionado === opcao && estilos.etiquetaTextoAtivo]}>{opcao}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Campo({ titulo, valor, aoMudar, placeholder, variasLinhas = false }) {
  return (
    <View style={estilos.campoBloco}>
      <Text style={estilos.campoTitulo}>{titulo}</Text>
      <TextInput
        accessibilityLabel={titulo}
        style={[estilos.campo, variasLinhas && estilos.campoGrande]}
        placeholder={placeholder}
        placeholderTextColor="#968CA2"
        value={valor}
        onChangeText={aoMudar}
        multiline={variasLinhas}
        textAlignVertical="top"
      />
    </View>
  );
}

function dataCurta(dataISO) {
  return new Date(dataISO).toLocaleDateString('pt-BR');
}

// Cópia no diretório de documentos: imagens temporárias da câmera/galeria
// podem desaparecer depois que o aplicativo é fechado.
async function guardarImagem(uri) {
  const nomeExtensao = uri.split('?')[0].match(/\.(jpg|jpeg|png|webp)$/i);
  const extensao = nomeExtensao ? nomeExtensao[1].toLowerCase() : 'jpg';
  const destino = new File(Paths.document, `cronicas_${Date.now()}_${Math.floor(Math.random() * 100000)}.${extensao}`);
  await new File(uri).copy(destino);
  return destino.uri;
}

function excluirImagemSePossivel(uri) {
  if (!uri) return;
  try {
    // Nunca apagar arquivos que não foram criados pelo próprio aplicativo.
    if (!uri.includes('/cronicas_')) return;
    const arquivo = new File(uri);
    if (arquivo.exists) arquivo.delete();
  } catch (erro) {
    console.warn('Não foi possível remover imagem antiga:', erro);
  }
}

export default function App() {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [rolagens, setRolagens] = useState([]);
  const [tela, setTela] = useState('lista'); // lista, formulario, detalhes, camera, dados
  const [registroAtual, setRegistroAtual] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [tipo, setTipo] = useState('NPC');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [segredo, setSegredo] = useState('');
  const [imagemUri, setImagemUri] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [cameraPronta, setCameraPronta] = useState(false);
  const [cameraPermissao, pedirCameraPermissao] = useCameraPermissions();
  const cameraRef = useRef(null);

  // useEffect: recuperar registros da memória persistente na inicialização.
  useEffect(() => {
    let montado = true;
    async function carregar() {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json && montado) {
          const itens = JSON.parse(json);
          if (Array.isArray(itens)) setRegistros(itens);
        }
      } catch (erro) {
        Alert.alert('Erro', 'Não foi possível carregar as crônicas salvas.');
      } finally {
        if (montado) setCarregando(false);
      }
    }
    carregar();
    return () => { montado = false; };
  }, []);

  async function persistir(listaAtualizada) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(listaAtualizada));
    setRegistros(listaAtualizada);
  }

  function novoRegistro() {
    setEditandoId(null);
    setRegistroAtual(null);
    setTipo('NPC'); setNome(''); setDescricao(''); setSegredo(''); setImagemUri(null);
    setTela('formulario');
  }

  function editarRegistro(item) {
    setEditandoId(item.id);
    setTipo(item.tipo); setNome(item.nome); setDescricao(item.descricao);
    setSegredo(item.segredo || ''); setImagemUri(item.imagemUri || null);
    setTela('formulario');
  }

  function abrirDetalhe(item) {
    setRegistroAtual(item);
    setTela('detalhes');
  }

  async function escolherGaleria() {
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 0.75,
      });
      if (!resultado.canceled && resultado.assets?.[0]?.uri) {
        setImagemUri(resultado.assets[0].uri);
      }
    } catch (erro) {
      Alert.alert('Galeria', 'Não foi possível selecionar uma imagem.');
    }
  }

  async function abrirCamera() {
    try {
      let permissao = cameraPermissao;
      if (!permissao?.granted) permissao = await pedirCameraPermissao();
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Autorize o uso da câmera nas configurações do celular.');
        return;
      }
      setCameraPronta(false);
      setTela('camera');
    } catch (erro) {
      Alert.alert('Câmera', 'Não foi possível solicitar permissão para a câmera.');
    }
  }

  async function fotografar() {
    if (!cameraPronta || !cameraRef.current) return;
    try {
      setCameraPronta(false);
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.75 });
      if (foto?.uri) setImagemUri(foto.uri);
      setTela('formulario');
    } catch (erro) {
      setCameraPronta(true);
      Alert.alert('Câmera', 'Não foi possível capturar a imagem.');
    }
  }

  async function salvarRegistro() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      Alert.alert('Campo obrigatório', 'Informe o nome do personagem, lugar ou sessão.');
      return;
    }
    if (salvando) return;
    setSalvando(true);
    const anterior = registros.find(item => item.id === editandoId);
    let imagemDefinitiva = anterior?.imagemUri || null;
    let imagemNova = null;
    try {
      if (imagemUri !== imagemDefinitiva) {
        if (imagemUri) {
          imagemNova = await guardarImagem(imagemUri);
          imagemDefinitiva = imagemNova;
        } else imagemDefinitiva = null;
      }
      const agora = new Date().toISOString();
      const item = {
        id: editandoId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tipo, nome: nomeLimpo, descricao: descricao.trim(), segredo: segredo.trim(),
        imagemUri: imagemDefinitiva, criadoEm: anterior?.criadoEm || agora,
      };
      const lista = anterior
        ? registros.map(registro => registro.id === anterior.id ? item : registro)
        : [item, ...registros];
      await persistir(lista);
      if (anterior?.imagemUri && anterior.imagemUri !== imagemDefinitiva) {
        excluirImagemSePossivel(anterior.imagemUri);
      }
      setTela('lista');
    } catch (erro) {
      if (imagemNova) excluirImagemSePossivel(imagemNova);
      Alert.alert('Erro ao salvar', 'Não foi possível salvar o registro. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao(item) {
    Alert.alert('Excluir registro?', `Remover "${item.nome}" do seu diário?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try {
          await persistir(registros.filter(registro => registro.id !== item.id));
          excluirImagemSePossivel(item.imagemUri);
          setTela('lista');
        } catch (erro) {
          Alert.alert('Erro', 'Não foi possível excluir o registro.');
        }
      } },
    ]);
  }

  async function compartilhar(item) {
    // O campo "segredo" NÃO é compartilhado. Vai somente o texto público.
    const mensagem = [
      'CRÔNICAS DO MESTRE',
      `${item.tipo.toUpperCase()}: ${item.nome}`,
      item.descricao ? `\n${item.descricao}` : '',
      '\nCompartilhado pelo diário de campanha.',
    ].join('\n');
    try {
      await Share.share({ title: item.nome, message: mensagem });
    } catch (erro) {
      Alert.alert('Compartilhamento', 'Não foi possível abrir o compartilhamento.');
    }
  }

  // A busca e o filtro por categoria são aplicados juntos.
  const termoBusca = normalizarTexto(busca.trim());
  const registrosFiltrados = registros.filter(item => {
    const mesmaCategoria = filtro === 'Todos' || item.tipo === filtro;
    const textoPesquisavel = normalizarTexto(`${item.nome} ${item.descricao || ''}`);
    return mesmaCategoria && (!termoBusca || textoPesquisavel.includes(termoBusca));
  });

  // Resultado inteiro, entre 1 e o número de faces do dado.
  function rolarDado(faces) {
    const resultado = Math.floor(Math.random() * faces) + 1;
    const novaRolagem = { id: `${Date.now()}_${Math.random()}`, faces, resultado };
    setRolagens(anteriores => [novaRolagem, ...anteriores].slice(0, 6));
  }

  if (tela === 'camera') {
    return (
      <View style={estilos.telaCamera}>
        <StatusBar barStyle="light-content" />
        <Text style={estilos.tituloCamera}>Fotografar referência</Text>
        <CameraView
          ref={cameraRef}
          style={estilos.previewCamera}
          facing="back"
          onCameraReady={() => setCameraPronta(true)}
        />
        <View style={estilos.acoesCamera}>
          <Botao texto="Cancelar" secundario aoClicar={() => setTela('formulario')} />
          <Botao texto="Capturar foto" desativado={!cameraPronta} aoClicar={fotografar} />
        </View>
      </View>
    );
  }

  if (tela === 'formulario') {
    return (
      <KeyboardAvoidingView style={estilos.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar barStyle="light-content" backgroundColor={PALETA.fundo} />
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.marca}>✦ CRÔNICAS DO MESTRE</Text>
          <Text style={estilos.titulo}>{editandoId ? 'Editar registro' : 'Nova crônica'}</Text>
          <Text style={estilos.subtitulo}>Guarde uma peça do seu mundo de RPG.</Text>
          <Text style={estilos.campoTitulo}>Categoria</Text>
          <Etiquetas opcoes={TIPOS} selecionado={tipo} aoSelecionar={setTipo} />
          <Campo titulo="Nome *" valor={nome} aoMudar={setNome} placeholder="Ex.: Eryndor, o velho ferreiro" />
          <Campo titulo="Descrição para compartilhar" valor={descricao} aoMudar={setDescricao} variasLinhas placeholder="O que os jogadores podem saber?" />
          <Campo titulo="Segredo do mestre (privado)" valor={segredo} aoMudar={setSegredo} variasLinhas placeholder="Motivações ocultas, pistas, reviravoltas..." />
          <Text style={estilos.campoTitulo}>Imagem de referência</Text>
          {imagemUri ? <Image source={{ uri: imagemUri }} style={estilos.imagemFormulario} /> : (
            <View style={estilos.imagemVazia}><Text style={estilos.imagemVaziaTexto}>Sem imagem selecionada</Text></View>
          )}
          <View style={estilos.linhaBotoes}>
            <View style={estilos.botaoFlex}><Botao texto="📷 Câmera" secundario aoClicar={abrirCamera}/></View>
            <View style={estilos.botaoFlex}><Botao texto="▧ Galeria" secundario aoClicar={escolherGaleria}/></View>
          </View>
          {imagemUri && <Botao texto="Remover imagem" secundario aoClicar={() => setImagemUri(null)}/>}
          <View style={estilos.espaco} />
          <Botao texto={salvando ? 'Salvando...' : 'Salvar crônica'} desativado={salvando} aoClicar={salvarRegistro}/>
          <Botao texto="Voltar sem salvar" secundario aoClicar={() => setTela('lista')}/>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (tela === 'detalhes' && registroAtual) {
    const item = registros.find(registro => registro.id === registroAtual.id) || registroAtual;
    return (
      <View style={estilos.raiz}>
        <StatusBar barStyle="light-content" backgroundColor={PALETA.fundo} />
        <ScrollView contentContainerStyle={estilos.conteudo}>
          <Text style={estilos.marca}>✦ CRÔNICAS DO MESTRE</Text>
          <Text style={estilos.tipoDetalhe}>{item.tipo.toUpperCase()} · {dataCurta(item.criadoEm)}</Text>
          <Text style={estilos.titulo}>{item.nome}</Text>
          {item.imagemUri && <Image source={{ uri: item.imagemUri }} style={estilos.imagemDetalhe} />}
          <Text style={estilos.cabecalhoSecao}>Informações públicas</Text>
          <Text style={estilos.paragrafo}>{item.descricao || 'Nenhuma descrição pública cadastrada.'}</Text>
          <View style={estilos.cartaoSecreto}>
            <Text style={estilos.cabecalhoSecreto}>🔒 Somente para o mestre</Text>
            <Text style={estilos.paragrafo}>{item.segredo || 'Nenhum segredo anotado.'}</Text>
          </View>
          <Botao texto="Compartilhar versão pública" aoClicar={() => compartilhar(item)} />
          <Botao texto="Editar registro" secundario aoClicar={() => editarRegistro(item)} />
          <Botao texto="Excluir registro" secundario perigo aoClicar={() => confirmarExclusao(item)} />
          <Botao texto="Voltar para o grimório" secundario aoClicar={() => setTela('lista')} />
        </ScrollView>
      </View>
    );
  }

  if (tela === 'dados') {
    const ultima = rolagens[0];
    return (
      <View style={estilos.raiz}>
        <StatusBar barStyle="light-content" backgroundColor={PALETA.fundo} />
        <ScrollView contentContainerStyle={estilos.conteudo}>
          <Text style={estilos.marca}>✦ FERRAMENTAS DO MESTRE</Text>
          <Text style={estilos.titulo}>Rolador de dados</Text>
          <Text style={estilos.subtitulo}>Escolha um dado e deixe o acaso decidir o próximo capítulo.</Text>
          <View style={estilos.cartaoResultado}>
            <Text style={estilos.rotuloResultado}>{ultima ? `ÚLTIMA ROLAGEM · D${ultima.faces}` : 'ESCOLHA UM DADO'}</Text>
            <Text style={estilos.numeroResultado}>{ultima ? ultima.resultado : '—'}</Text>
            <Text style={estilos.textoResultado}>O resultado vai de 1 até o número de faces.</Text>
          </View>
          <Text style={estilos.cabecalhoSecao}>Escolha seu dado</Text>
          <View style={estilos.gradeDados}>
            {DADOS.map(faces => (
              <Pressable
                key={faces}
                accessibilityRole="button"
                accessibilityLabel={`Rolar dado de ${faces} faces`}
                style={({ pressed }) => [estilos.dadoBotao, pressed && { opacity: 0.6 }]}
                onPress={() => rolarDado(faces)}
              >
                <Text style={estilos.dadoSimbolo}>⚄</Text>
                <Text style={estilos.dadoNome}>D{faces}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={estilos.cabecalhoSecao}>Últimas rolagens</Text>
          {rolagens.length === 0 ? (
            <Text style={estilos.legendaDados}>Nenhuma rolagem ainda. Toque em um dado para começar.</Text>
          ) : (
            <View style={estilos.historicoDados}>
              {rolagens.map(rolagem => (
                <View key={rolagem.id} style={estilos.linhaHistorico}>
                  <Text style={estilos.historicoTipo}>D{rolagem.faces}</Text>
                  <Text style={estilos.historicoValor}>{rolagem.resultado}</Text>
                </View>
              ))}
            </View>
          )}
          {rolagens.length > 0 && <Botao texto="Limpar histórico" secundario aoClicar={() => setRolagens([])} />}
          <Botao texto="Voltar ao grimório" secundario aoClicar={() => setTela('lista')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={estilos.raiz}>
      <StatusBar barStyle="light-content" backgroundColor={PALETA.fundo} />
      <FlatList
        data={registrosFiltrados}
        keyExtractor={item => item.id}
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text style={estilos.marca}>✦ ARQUIVO DE CAMPANHAS</Text>
            <Text style={estilos.titulo}>Crônicas do Mestre</Text>
            <Text style={estilos.subtitulo}>Personagens, lugares e histórias em um só grimório.</Text>
            <View style={estilos.cartaoResumo}>
              <Text style={estilos.numeroResumo}>{registros.length}</Text>
              <View style={{ flex: 1 }}>
                <Text style={estilos.resumoTitulo}>Registros no grimório</Text>
                <Text style={estilos.resumoSubtitulo}>Dados salvos neste celular</Text>
              </View>
            </View>
            <Botao texto="+ Criar novo registro" aoClicar={novoRegistro}/>
            <Botao texto="🎲 Abrir rolador de dados" secundario aoClicar={() => setTela('dados')}/>
            <Text style={estilos.cabecalhoSecao}>Seu grimório</Text>
            <TextInput
              accessibilityLabel="Buscar registros"
              style={[estilos.campo, estilos.campoBusca]}
              placeholder="Buscar NPCs, lugares e sessões..."
              placeholderTextColor="#968CA2"
              autoCorrect={false}
              value={busca}
              onChangeText={setBusca}
            />
            <Etiquetas opcoes={FILTROS} selecionado={filtro} aoSelecionar={setFiltro}/>
          </View>
        }
        ListEmptyComponent={
          <View style={estilos.vazio}>
            <Text style={estilos.vazioTitulo}>{carregando ? 'Abrindo o grimório...' : (busca.trim() || filtro !== 'Todos') ? 'Nenhum resultado encontrado' : 'Nenhum registro por aqui'}</Text>
            <Text style={estilos.vazioDescricao}>{(busca.trim() || filtro !== 'Todos') ? 'Tente outro nome ou ajuste o filtro.' : 'Comece criando um NPC, lugar ou resumo de sessão.'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => abrirDetalhe(item)} style={({ pressed }) => [estilos.cartaoItem, pressed && { opacity: 0.7 }]}>
            {item.imagemUri ? (
              <Image source={{ uri: item.imagemUri }} style={estilos.miniatura} />
            ) : (
              <View style={estilos.miniaturaVazia}><Text style={estilos.iconeMiniatura}>{item.tipo === 'NPC' ? '♟' : item.tipo === 'Lugar' ? '⌘' : '✦'}</Text></View>
            )}
            <View style={estilos.cartaoTexto}>
              <Text style={estilos.tipoItem}>{item.tipo.toUpperCase()} · {dataCurta(item.criadoEm)}</Text>
              <Text style={estilos.nomeItem} numberOfLines={1}>{item.nome}</Text>
              <Text style={estilos.descricaoItem} numberOfLines={2}>{item.descricao || 'Toque para ver os detalhes.'}</Text>
            </View>
            <Text style={estilos.seta}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: PALETA.fundo },
  conteudo: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 54 },
  marca: { color: PALETA.ouro, letterSpacing: 2, fontWeight: '800', fontSize: 11, marginBottom: 10 },
  titulo: { color: PALETA.texto, fontWeight: '800', fontSize: 30, marginBottom: 6 },
  subtitulo: { color: PALETA.suave, fontSize: 14, lineHeight: 20, marginBottom: 22 },
  botao: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  botaoPrimario: { backgroundColor: PALETA.ouro },
  botaoSecundario: { backgroundColor: PALETA.painel, borderWidth: 1, borderColor: PALETA.borda },
  botaoPerigo: { borderColor: PALETA.perigo },
  botaoTexto: { color: PALETA.fundo, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  botaoSecundarioTexto: { color: PALETA.texto },
  linhaEtiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  etiqueta: { borderRadius: 40, borderWidth: 1, borderColor: PALETA.borda, backgroundColor: PALETA.painel, paddingHorizontal: 13, paddingVertical: 9 },
  etiquetaAtiva: { borderColor: PALETA.ouro, backgroundColor: PALETA.ouro },
  etiquetaTexto: { color: PALETA.suave, fontWeight: '700', fontSize: 12 },
  etiquetaTextoAtivo: { color: PALETA.fundo },
  campoBloco: { marginBottom: 16 },
  campoTitulo: { color: PALETA.texto, fontWeight: '700', fontSize: 14, marginBottom: 8 },
  campo: { borderWidth: 1, borderColor: PALETA.borda, backgroundColor: PALETA.painel, color: PALETA.texto, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, fontSize: 15, minHeight: 48 },
  campoGrande: { minHeight: 100 },
  campoBusca: { marginBottom: 14 },
  cartaoResultado: { alignItems: 'center', borderWidth: 1, borderColor: PALETA.borda, backgroundColor: PALETA.painel, borderRadius: 18, padding: 24 },
  rotuloResultado: { color: PALETA.ouro, fontSize: 12, letterSpacing: 1.4, fontWeight: '800' },
  numeroResultado: { color: PALETA.ouro, fontSize: 70, fontWeight: '900', marginVertical: 8 },
  textoResultado: { color: PALETA.suave, fontSize: 12, textAlign: 'center' },
  gradeDados: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  dadoBotao: { width: '31%', minHeight: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETA.painel, borderColor: PALETA.borda, borderWidth: 1, borderRadius: 14 },
  dadoSimbolo: { color: PALETA.ouro, fontSize: 25, marginBottom: 3 },
  dadoNome: { color: PALETA.texto, fontSize: 18, fontWeight: '900' },
  legendaDados: { color: PALETA.suave, fontSize: 13, marginBottom: 24 },
  historicoDados: { backgroundColor: PALETA.painel, borderRadius: 14, paddingHorizontal: 15, marginBottom: 15, borderColor: PALETA.borda, borderWidth: 1 },
  linhaHistorico: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomColor: PALETA.borda, borderBottomWidth: 1 },
  historicoTipo: { color: PALETA.suave, fontSize: 14 },
  historicoValor: { color: PALETA.ouro, fontSize: 16, fontWeight: '800' },
  imagemFormulario: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12 },
  imagemVazia: { height: 105, justifyContent: 'center', alignItems: 'center', backgroundColor: PALETA.painel, borderWidth: 1, borderStyle: 'dashed', borderColor: PALETA.borda, borderRadius: 12, marginBottom: 12 },
  imagemVaziaTexto: { color: PALETA.suave },
  linhaBotoes: { flexDirection: 'row', gap: 10 },
  botaoFlex: { flex: 1 },
  espaco: { height: 10 },
  cartaoResumo: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: PALETA.borda, backgroundColor: PALETA.painel, marginBottom: 20 },
  numeroResumo: { color: PALETA.ouro, fontWeight: '900', fontSize: 37 },
  resumoTitulo: { color: PALETA.texto, fontWeight: '800', fontSize: 15 },
  resumoSubtitulo: { color: PALETA.suave, fontSize: 12, marginTop: 4 },
  cabecalhoSecao: { fontSize: 17, fontWeight: '800', color: PALETA.texto, marginTop: 20, marginBottom: 14 },
  vazio: { alignItems: 'center', padding: 35, borderWidth: 1, borderColor: PALETA.borda, borderRadius: 14, backgroundColor: PALETA.painel },
  vazioTitulo: { color: PALETA.texto, fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  vazioDescricao: { color: PALETA.suave, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  cartaoItem: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, backgroundColor: PALETA.painel, borderWidth: 1, borderColor: PALETA.borda, borderRadius: 14, marginBottom: 10 },
  miniatura: { width: 65, height: 65, borderRadius: 9 },
  miniaturaVazia: { width: 65, height: 65, backgroundColor: PALETA.painelClaro, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  iconeMiniatura: { color: PALETA.ouro, fontSize: 29 },
  cartaoTexto: { flex: 1 },
  tipoItem: { color: PALETA.ouro, fontSize: 10, letterSpacing: 0.5, marginBottom: 4, fontWeight: '700' },
  nomeItem: { color: PALETA.texto, fontSize: 16, fontWeight: '800' },
  descricaoItem: { color: PALETA.suave, fontSize: 12, marginTop: 4, lineHeight: 17 },
  seta: { color: PALETA.ouro, fontSize: 27 },
  tipoDetalhe: { color: PALETA.ouro, fontSize: 12, marginBottom: 8, marginTop: 12, fontWeight: '700' },
  imagemDetalhe: { width: '100%', height: 240, borderRadius: 14, marginTop: 12 },
  paragrafo: { color: PALETA.texto, fontSize: 15, lineHeight: 23, marginBottom: 22 },
  cartaoSecreto: { backgroundColor: PALETA.painel, borderWidth: 1, borderColor: PALETA.borda, borderRadius: 14, padding: 17, marginBottom: 20 },
  cabecalhoSecreto: { fontWeight: '800', color: PALETA.ouro, fontSize: 15, marginBottom: 10 },
  telaCamera: { flex: 1, backgroundColor: PALETA.fundo, paddingTop: 52, paddingHorizontal: 16 },
  tituloCamera: { color: PALETA.texto, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 18 },
  previewCamera: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  acoesCamera: { paddingVertical: 14 },
});
