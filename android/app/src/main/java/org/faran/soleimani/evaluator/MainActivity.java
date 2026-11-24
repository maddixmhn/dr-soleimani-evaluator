package org.faran.soleimani.evaluator;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StudyDocuments.class);
        super.onCreate(savedInstanceState);
    }
}
