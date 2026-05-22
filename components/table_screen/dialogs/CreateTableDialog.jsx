"use client";

import { useEffect, useState } from 'react';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import TableDialogOverlay from '@/components/dialog/TableDialogOverlay';
import { getGameTypeName } from '@/lib/constants';
import { STAKES_OPTIONS } from '@/lib/stakes';

export default function CreateTableDialog({
  lobbyId,
  onPreviewNameChange,
  onCreateRequest,
  onCancel,
}) {
  const [lobbyInfo, setLobbyInfo] = useState({ name: "Loading...", gameType: 1 });
  const [existingTableNames, setExistingTableNames] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [isFetchingLobby, setIsFetchingLobby] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [formData, setFormData] = useState({
    name: "New Player Table",
    buyin: STAKES_OPTIONS[2].buyin,
    blinds: STAKES_OPTIONS[2].blinds,
    maxPlayers: 2,
    lobbyId: Number(lobbyId),
  });

  const { getLobbyById, getTableCount, getTablesRange } = usePrivatePokerLobby();

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      lobbyId: Number(lobbyId),
    }));
  }, [lobbyId]);

  useEffect(() => {
    onPreviewNameChange?.(formData.name);
  }, [formData.name, onPreviewNameChange]);

  useEffect(() => {
    let cancelled = false;

    const fetchLobbyAndTables = async () => {
      try {
        setIsFetchingLobby(true);
        const lobbyData = await getLobbyById(lobbyId);
        if (cancelled) return;

        setLobbyInfo({
          name: lobbyData.name,
          gameType: lobbyData.gameType,
        });

        const count = await getTableCount(lobbyId);
        if (cancelled) return;

        if (count > 0) {
          const rawTables = await getTablesRange(lobbyId, 0, count);
          if (!cancelled) {
            setExistingTableNames(rawTables.map((table) => table.name.toLowerCase()));
          }
        } else {
          setExistingTableNames([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch authentic lobby info:", error);
          setLobbyInfo({ name: "Lobby Not Found", gameType: 1 });
        }
      } finally {
        if (!cancelled) setIsFetchingLobby(false);
      }
    };

    fetchLobbyAndTables();
    return () => {
      cancelled = true;
    };
  }, [lobbyId]);

  const isNameTaken = existingTableNames.includes(formData.name.trim().toLowerCase());

  const closeDialog = (afterClose) => {
    setIsClosing(true);
    setTimeout(afterClose, 260);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    const cleanName = formData.name.trim();

    if (!cleanName) {
      setSubmitError("Table name cannot be empty.");
      return;
    }
    if (cleanName.length > 32) {
      setSubmitError("Table name is too long (max 32 characters).");
      return;
    }
    if (isNameTaken) {
      setSubmitError("A table with this name already exists.");
      return;
    }
    if (!formData.buyin || formData.buyin <= 0) {
      setSubmitError("Invalid buy-in amount.");
      return;
    }
    if (!formData.lobbyId || formData.lobbyId <= 0) {
      setSubmitError("Invalid Lobby ID.");
      return;
    }

    try {
      const tableId = Date.now();
      const request = {
        lobbyId: formData.lobbyId,
        lobbyName: lobbyInfo.name,
        tableId,
        tableName: cleanName,
        buyIn: formData.buyin,
        blinds: formData.blinds,
        stakesLabel: STAKES_OPTIONS.find((option) => option.buyin === formData.buyin)?.label?.split(':')[0],
        numPlayers: formData.maxPlayers,
      };
      closeDialog(() => onCreateRequest?.(request));
    } catch (error) {
      console.error(error);
      setSubmitError(error.shortMessage || error.details || error.message || "Transaction failed or was rejected by the wallet.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <TableDialogOverlay isClosing={isClosing}>
      <div className="bg-slate-950/50 p-6 border-b border-teal-500/20">
        <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          Private Poker
        </p>
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
          Create New Table
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
        <div>
          <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Lobby</label>
          <input
            type="text"
            value={isFetchingLobby ? "Loading..." : lobbyInfo.name}
            className="w-full bg-slate-950 border border-slate-700 text-slate-500 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none cursor-not-allowed"
            disabled
          />
        </div>

        <div>
          <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Table Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full bg-slate-950 border text-sm font-bold px-4 py-3 rounded-lg focus:outline-none transition-all ${isNameTaken
              ? 'border-red-500 text-red-400 focus:border-red-500 focus:shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'border-slate-700 text-teal-400 focus:border-teal-400 focus:shadow-[0_0_15px_rgba(20,184,166,0.2)]'
            }`}
            required
            disabled={isPending || isFetchingLobby}
          />
          {isNameTaken && (
            <p className="text-red-500 text-[10px] mt-1 font-mono tracking-wider">
              * A table with this name already exists in this lobby.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Game Type</label>
            <input
              type="text"
              value={isFetchingLobby ? "..." : getGameTypeName(lobbyInfo.gameType)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-500 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none transition-all cursor-not-allowed"
              disabled
            />
          </div>

          <div>
            <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Capacity</label>
            <select
              value={formData.maxPlayers}
              onChange={(e) => setFormData({ ...formData, maxPlayers: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-700 text-slate-300 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 transition-all appearance-none cursor-pointer font-mono"
              disabled={isPending || isFetchingLobby}
            >
              <option value={2}>2 Players (Heads Up)</option>
              <option value={3}>3 Players</option>
              <option value={4}>4 Players</option>
              <option value={6}>6 Players (Max)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Stakes & Buy-In</label>
          <select
            value={formData.buyin}
            onChange={(e) => {
              const selectedValue = Number(e.target.value);
              const selectedOption = STAKES_OPTIONS.find((opt) => opt.buyin === selectedValue);
              if (selectedOption) {
                setFormData({
                  ...formData,
                  buyin: selectedOption.buyin,
                  blinds: selectedOption.blinds,
                });
              }
            }}
            className="w-full bg-slate-950 border border-slate-700 text-teal-400 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 transition-all appearance-none cursor-pointer font-mono focus:shadow-[0_0_15px_rgba(20,184,166,0.2)]"
            disabled={isPending || isFetchingLobby}
          >
            {STAKES_OPTIONS.map((opt) => (
              <option key={opt.buyin} value={opt.buyin}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-4 mt-6 pt-6 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 hover:text-slate-200 transition-colors uppercase text-xs tracking-widest disabled:opacity-50 cursor-pointer"
          >
            Abort
          </button>

          <button
            type="submit"
            disabled={isPending || isFetchingLobby || isNameTaken || formData.name.trim() === "" || lobbyInfo.name === "Lobby Not Found"}
            className="flex-[2] py-3 rounded-lg bg-teal-500 text-slate-950 font-black hover:bg-teal-400 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex justify-center items-center"
          >
            {isFetchingLobby ? (
              <span className="animate-pulse">Verifying Data...</span>
            ) : lobbyInfo.name === "Lobby Not Found" ? (
              "Error: Lobby Missing"
            ) : (
              "Buy-in to create table"
            )}
          </button>
        </div>

        {submitError && (
          <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold uppercase tracking-widest text-center">
            {submitError}
          </div>
        )}
      </form>
    </TableDialogOverlay>
  );
}
