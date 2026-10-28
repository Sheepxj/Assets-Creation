package com.sheepxj.assets.asset;

import com.sheepxj.assets.persistence.mapper.AssetMapper;
import com.sheepxj.assets.security.CurrentUser;
import com.sheepxj.assets.security.OwnedResources;
import com.sheepxj.assets.security.UserIdentity;
import com.sheepxj.assets.storage.FileStorage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AssetServiceTest {
    @TempDir Path root;

    @Test
    void databaseInsertFailureRemovesTheCompletedFile() throws Exception {
        var mapper = mock(AssetMapper.class);
        when(mapper.insert(any())).thenThrow(new DataAccessResourceFailureException("offline"));
        var transactions = transactions();
        var service = service(mapper, transactions);
        assertThrows(DataAccessResourceFailureException.class, () -> service.upload(file()));
        assertNoFiles(); verify(transactions).rollback(any());
    }

    @Test
    void transactionCommitFailureDoesNotLeaveAnUnreferencedUpload() throws Exception {
        var mapper = mock(AssetMapper.class); when(mapper.insert(any())).thenReturn(1);
        var transactions = transactions();
        doThrow(new TransactionSystemException("commit failed")).when(transactions).commit(any());
        var service = service(mapper, transactions);
        assertThrows(TransactionSystemException.class, () -> service.upload(file()));
        assertNoFiles();
    }

    private AssetService service(AssetMapper mapper, PlatformTransactionManager transactions) {
        var current = mock(CurrentUser.class);
        when(current.require()).thenReturn(new UserIdentity(UUID.randomUUID().toString(), "test_user"));
        return new AssetService(current, new ImageValidator(), new FileStorage(root.toString()), mapper, mock(OwnedResources.class), transactions);
    }
    private PlatformTransactionManager transactions() {
        var manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        return manager;
    }
    private MockMultipartFile file() throws Exception { return new MockMultipartFile("file", "portrait.png", "image/png", ImageValidatorTest.sample("portrait.png")); }
    private void assertNoFiles() throws Exception { try (var files = Files.walk(root)) { assertEquals(0, files.filter(Files::isRegularFile).count()); } }
}
