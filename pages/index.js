import Home from "../components/Home";
import Map from "../components/Map";
import FAQ from "../components/FAQ";
import React from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import Navbar from "react-bootstrap/Navbar";
import Button from "react-bootstrap/Button";
import {
  NETWORK_NAME,
  NETWORK_ID,
  ADMIN_CONTRACT_ADDRESS,
  CERAMIC_API_ENDPOINT,
  IPFS_BOOTSTRAP_PEER,
  THREE_ID_CONNECT_IFRAME_URL,
  THREE_ID_CONNECT_MANAGEMENT_URL,
} from "../lib/constants";
import CeramicClient from "@ceramicnetwork/http-client";
import { ThreeIdConnect, EthereumAuthProvider } from "@3id/connect";
import KeyDidResolver from "key-did-resolver";
import ThreeIdResolver from "@ceramicnetwork/3id-did-resolver";
import { Web3ReactProvider, useWeb3React, UnsupportedChainIdError } from "@web3-react/core";
import { truncateStr } from "../lib/truncate";
import { 
  InjectedConnector,
  NoEthereumProviderError,
  UserRejectedRequestError as UserRejectedRequestErrorInjected
} from "@web3-react/injected-connector";

import {
  URI_AVAILABLE,
  UserRejectedRequestError as UserRejectedRequestErrorWalletConnect
} from "@web3-react/walletconnect-connector";
import { UserRejectedRequestError as UserRejectedRequestErrorFrame } from "@web3-react/frame-connector";
import { Web3Provider } from "@ethersproject/providers";
import { formatEther } from "@ethersproject/units";

import {
  injected,
  network,
  walletconnect,
  walletlink,
  ledger,
  trezor,
  frame,
  fortmatic,
  portis,
  squarelink,
  torus,
  authereum
} from "../connectors";
import { useEagerConnect, useInactiveListener } from "../hooks";
import { Spinner } from "./Spinner";

import { ethers } from "ethers";
import { DID } from "dids";

const { getIpfs, providers } = require("ipfs-provider");
const { httpClient, jsIpfs } = providers;

const geoWebAdminABI = require("../contracts/GeoWebAdmin_v0.json");

const connectorsByName = {
  Injected: injected,
  Network: network,
  WalletConnect: walletconnect,
  WalletLink: walletlink,
  Ledger: ledger,
  Trezor: trezor,
  Frame: frame,
  Fortmatic: fortmatic,
  Portis: portis,
  Squarelink: squarelink,
  Torus: torus,
  Authereum: authereum
};

function getErrorMessage(error) {
  if (error instanceof NoEthereumProviderError) {
    return "No Ethereum browser extension detected, install MetaMask on desktop or visit from a dApp browser on mobile.";
  } else if (error instanceof UnsupportedChainIdError) {
    return "You're connected to an unsupported network.";
  } else if (
    error instanceof UserRejectedRequestErrorInjected ||
    error instanceof UserRejectedRequestErrorWalletConnect ||
    error instanceof UserRejectedRequestErrorFrame
  ) {
    return "Please authorize this website to access your Ethereum account.";
  } else {
    console.error(error);
    return "An unknown error occurred. Check the console for more details.";
  }
}

function getLibrary(provider) {
  const library = new Web3Provider(provider);
  library.pollingInterval = 8000;
  return library;
}

function useEagerConnect() {
  const { activate, active } = useWeb3React();

  const [tried, setTried] = React.useState(false);

  React.useEffect(() => {
    injected.isAuthorized().then((isAuthorized) => {
      if (isAuthorized) {
        activate(injected, undefined, true).catch(() => {
          setTried(true);
        });
      } else {
        setTried(true);
      }
    });
  }, []); // intentionally only running on mount (make sure it's only mounted once :))

  // if the connection worked, wait until we get confirmation of that to flip the flag
  React.useEffect(() => {
    if (!tried && active) {
      setTried(true);
    }
  }, [tried, active]);

  return tried;
}

function IndexPage() {
  return (
    <Web3ReactProvider getLibrary={getLibrary}>
      <IndexPageContent />
    </Web3ReactProvider>
  );
}

function IndexPageContent() {
  const context = useWeb3React();
  const {
    connector,
    library,
    chainId,
    account,
    activate,
    deactivate,
    active,
    error,
  } = context;

  const triedEager = useEagerConnect();
  const [adminContract, setAdminContract] = React.useState(null);
  const [ceramic, setCeramic] = React.useState(null);
  const [ipfs, setIPFS] = React.useState(null);

  // handle logic to recognize the connector currently being activated
  const [activatingConnector, setActivatingConnector] = React.useState();
  React.useEffect(() => {
    console.log('running')
    if (activatingConnector && activatingConnector === connector) {
      setActivatingConnector(undefined);
    }
  }, [activatingConnector, connector]);


  React.useEffect(async () => {
    if (active == false) {
      return;
    }

    // Create Ceramic and DID with resolvers
    const ceramic = new CeramicClient(CERAMIC_API_ENDPOINT);

    const resolver = {
      ...KeyDidResolver.getResolver(),
      ...ThreeIdResolver.getResolver(ceramic),
    };

    const did = new DID({ resolver });
    ceramic.setDID(did);

    // Add provider to Ceramic DID
    const ethProvider = await connector.getProvider();
    const threeIdConnect = new ThreeIdConnect(
      THREE_ID_CONNECT_IFRAME_URL,
      THREE_ID_CONNECT_MANAGEMENT_URL
    );

    const authProvider = new EthereumAuthProvider(ethProvider, account);
    await threeIdConnect.connect(authProvider);

    const didProvider = await threeIdConnect.getDidProvider();

    await ceramic.did.setProvider(didProvider);
    await ceramic.did.authenticate();

    setCeramic(ceramic);

    const { ipfs, provider, apiAddress } = await getIpfs({
      loadHttpClientModule: () => require("ipfs-http-client"),
      providers: [
        httpClient({
          apiAddress: "/ip4/127.0.0.1/tcp/5001",
        }),
        jsIpfs({
          loadJsIpfsModule: () => require("ipfs-core"),
          options: { Bootstrap: [IPFS_BOOTSTRAP_PEER] },
        }),
      ],
    });

    setIPFS(ipfs);
  }, [active, account]);

  // Setup Contracts on App Load
  React.useEffect(() => {
    if (library == null) {
      return;
    }
    async function contractsSetup() {
      const signer = library.getSigner();

      let _adminContract = new ethers.Contract(
        ADMIN_CONTRACT_ADDRESS,
        geoWebAdminABI,
        library
      );
      let _adminContractWithSigner = _adminContract.connect(signer);
      setAdminContract(_adminContractWithSigner);
    }
    contractsSetup();
  }, [library]);

  return (
    <>
      <Container fluid>
        <Navbar
          bg="dark"
          variant="dark"
          fixed="top"
          style={{ height: "100px" }}
          className="border-bottom border-purple"
        >
          {/*<Col sm="1" className="text-center">
             <Badge pill variant="secondary" className="py-2 px-3">
              <span style={{ fontWeight: 600 }}>TESTNET</span>
            </Badge> 
          </Col>*/}
          <Col sm="1" className="p-0">
            <FAQ account={account} adminAddress={ADMIN_CONTRACT_ADDRESS} />
          </Col>
          <Col sm={{ span: 8, offset: 0 }} className="text-center p-2 mx-auto">
            <div
              className="text-primary"
              style={{ fontSize: "2.5em", fontFamily: "Abel" }}
            >
              <Image style={{ height: "1.1em" }} src="logo.png" /> Geo Web
              Cadastre
            </div>
            <div className="text-light" style={{ fontSize: "1em" }}>
              Claim, transfer, and manage digital land
            </div>
          </Col>
          <Col sm={{ span: 2, offset: 0 }} className="p-0">
            {active == false ? (
              <Button
                target="_blank"
                rel="noreferrer"
                variant="outline-primary"
                className="text-light font-weight-bold border-dark"
                style={{ height: "100px" }}
                onClick={() => activate(injected)}
              >
                <img src="vector.png" width="40" style={{marginRight: 20}} />
                Connect Wallet
              </Button>
            ) : (
              <Button
                target="_blank"
                rel="noreferrer"
                variant="outline-danger"
                className="text-light font-weight-bold border-dark"
                style={{ height: "100px" }}
                onClick={() => deactivate()}
              >
                Disconnect Wallet{" "}
                <Badge pill variant="secondary" className="py-2 px-3">
                  <span style={{ fontWeight: 600 }}>
                    {truncateStr(account, 20)}
                  </span>
                </Badge>
              </Button>
            )}
          </Col>
        </Navbar>
      </Container>
      <Container fluid>
        {active ? (
          <Row>
            <Map
              account={account}
              adminContract={adminContract}
              ceramic={ceramic}
              adminAddress={ADMIN_CONTRACT_ADDRESS}
              ipfs={ipfs}
            ></Map>
          </Row>
        ) : 
        <Home />
      }
      </Container>
    </>
  );
}

export default IndexPage;
